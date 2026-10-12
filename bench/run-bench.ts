import fs from "node:fs";
import path from "node:path";

import { buildArtifactPath } from "./artifacts.ts";
import {
    calculateBytesPerSecond,
    expectedContentTypes,
    validateBenchResponse,
    type BenchmarkFormat,
    type ResponseValidation,
} from "./contract.ts";
import { assertArtifactMetadata, collectEnvironmentMetadata } from "./environment.ts";
import { startResourceSampling, type ResourceStats } from "./process-metrics.ts";
import { startServer, type Runtime } from "./server-runner.ts";

interface MatrixRow {
    format: BenchmarkFormat;
    scenario: string;
    status: string;
}

interface MatrixFile {
    matrix: MatrixRow[];
}

interface RequestResult {
    startedAt: string;
    elapsedMs: number;
    res: Response;
    payload: Buffer;
}

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const matrixPath = path.join(repoRoot, "bench", "support-matrix.json");
const artifactDir = path.join(repoRoot, "bench", "artifacts");
const runtime = (process.env.BENCH_RUNTIME || "bun") as Runtime;
const port = process.env.BENCH_PORT || "3000";
const baseUrl = process.env.BENCH_URL || `http://127.0.0.1:${port}`;
const selectedStatus = process.env.BENCH_STATUS || "supported";
const repetitions = Number(process.env.BENCH_REPETITIONS || 3);
if (!["bun", "rust"].includes(runtime)) {
    throw new Error(`Unsupported BENCH_RUNTIME=${runtime}; use bun or rust`);
}
if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("BENCH_REPETITIONS must be a positive integer");
}

const matrix = (JSON.parse(fs.readFileSync(matrixPath, "utf8")) as MatrixFile).matrix;
const rows = matrix.filter((item) => item.status === selectedStatus);

if (!rows.length) {
    throw new Error(`No rows found for BENCH_STATUS=${selectedStatus}`);
}

function percentile(values: number[], percentileValue: number): number | null {
    if (!values.length) return null;
    const sorted = [...values].toSorted((left, right) => left - right);
    const index = (sorted.length - 1) * percentileValue;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    const sortedLower = sorted[lower];
    const sortedUpper = sorted[upper];

    if (sortedLower === undefined || sortedUpper === undefined) return null;
    if (lower === upper) return sortedLower;

    return sortedLower + (sortedUpper - sortedLower) * (index - lower);
}

async function runRepetition(repetition: number) {
    const server = await startServer({ repoRoot, runtime, baseUrl });
    const resourceSampling = startResourceSampling(server.child.pid as number);
    let resourceStats: ResourceStats | undefined;
    try {
        const results = [];

        for (const row of rows) {
            const rowResourceSampling = startResourceSampling(server.child.pid as number);
            const url = `${baseUrl}/bench/${row.format}/${row.scenario}`;
            const request = async (): Promise<RequestResult> => {
                const startedAt = new Date().toISOString();
                const t0 = performance.now();
                const res = await fetch(url);
                const elapsedMs = performance.now() - t0;
                const payload = Buffer.from(await res.arrayBuffer());
                return { startedAt, elapsedMs, res, payload };
            };

            const firstReq = await request();
            const secondReq = await request();
            const contentType = firstReq.res.headers.get("content-type") ?? "";
            const validation: ResponseValidation = validateBenchResponse(
                { status: firstReq.res.status, contentType, payloadBytes: firstReq.payload.length },
                { status: secondReq.res.status, payloadBytes: secondReq.payload.length },
                expectedContentTypes[row.format],
            );

            if (
                !validation.statusOk ||
                !validation.contentTypeOk ||
                !validation.nonEmpty ||
                !validation.stablePayload
            ) {
                throw new Error(
                    `Validation failed for ${row.format}/${row.scenario}: ${JSON.stringify(validation)}`,
                );
            }

            const deserializeResponse = await fetch(
                `${baseUrl}/deserialize/${row.format}/${row.scenario}`,
                {
                    method: "POST",
                    headers: { "Content-Type": expectedContentTypes[row.format] },
                    body: firstReq.payload,
                },
            );
            if (deserializeResponse.status !== 200) {
                throw new Error(
                    `Deserialization smoke check failed for ${row.format}/${row.scenario}: ${deserializeResponse.status}`,
                );
            }

            const rowResourceStats = rowResourceSampling.stop();

            results.push({
                repetition,
                runtime,
                format: row.format,
                scenario: row.scenario,
                status: row.status,
                httpStatus: firstReq.res.status,
                contentType,
                payloadBytes: firstReq.payload.length,
                bytesPerSecond: calculateBytesPerSecond(
                    firstReq.payload.length,
                    firstReq.elapsedMs,
                ),
                elapsedMs: firstReq.elapsedMs,
                startedAt: firstReq.startedAt,
                requestUrl: url,
                ok: firstReq.res.ok,
                validation,
                deserializationStatus: deserializeResponse.status,
                resourceSampling: rowResourceStats,
            });
        }

        resourceStats = resourceSampling.stop();
        return {
            results,
            resourceSampling: {
                source: "/proc",
                intervalMs: 100,
                ...resourceStats,
            },
        };
    } finally {
        if (!resourceStats) resourceSampling.stop();
        server.stop();
        if (server.getOutput().trim()) console.log(server.getOutput().trim());
    }
}

const repetitionsResults = [];
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    repetitionsResults.push(await runRepetition(repetition));
}

const flatResults = repetitionsResults.flatMap((repetition) => repetition.results);
const aggregates = rows.map((row) => {
    const observations = flatResults
        .filter((result) => result.format === row.format && result.scenario === row.scenario)
        .map((result) => result.elapsedMs);
    const average = observations.reduce((sum, value) => sum + value, 0) / observations.length;
    const bytesPerSecond = flatResults
        .filter((result) => result.format === row.format && result.scenario === row.scenario)
        .map((result) => result.bytesPerSecond)
        .filter((value): value is number => value !== null)
        .reduce((sum, value, _index, values) => sum + value / values.length, 0);
    return {
        runtime,
        format: row.format,
        scenario: row.scenario,
        repetitions: observations.length,
        p50Ms: percentile(observations, 0.5),
        p95Ms: percentile(observations, 0.95),
        p99Ms: percentile(observations, 0.99),
        rps: average > 0 ? 1000 / average : null,
        bytesPerSecond: bytesPerSecond || null,
        minMs: Math.min(...observations),
        maxMs: Math.max(...observations),
        spreadMs: Math.max(...observations) - Math.min(...observations),
    };
});
const resourceAverages = repetitionsResults.map((repetition) => repetition.resourceSampling);
const averageResourceValue = (values: Array<number | null>) => {
    const available = values.filter((value): value is number => value !== null);
    return available.length
        ? available.reduce((sum, value) => sum + value, 0) / available.length
        : null;
};

fs.mkdirSync(artifactDir, { recursive: true });
const artifact = {
    meta: {
        generatedAt: new Date().toISOString(),
        runtime,
        serverUrl: baseUrl,
        contract: "GET /bench/{format}/{scenario}",
        benchStatusFilter: selectedStatus,
        repetitions,
        total: rows.length * repetitions,
        executionMode: runtime === "rust" ? "cargo build --release" : "bun run src/index.ts",
        rejectionRule:
            "Abort a repetition when status, content type, non-empty payload, or stable size validation fails.",
        resourceAggregate: {
            cpuAveragePercent: averageResourceValue(
                resourceAverages.map((item) => item.cpuAveragePercent),
            ),
            cpuMaxPercent: averageResourceValue(resourceAverages.map((item) => item.cpuMaxPercent)),
            rssAverageBytes: averageResourceValue(
                resourceAverages.map((item) => item.rssAverageBytes),
            ),
            rssMaxBytes: averageResourceValue(resourceAverages.map((item) => item.rssMaxBytes)),
        },
        environment: collectEnvironmentMetadata(repoRoot),
    },
    repetitions: repetitionsResults,
    aggregates,
};
assertArtifactMetadata(artifact.meta);

const artifactPath = buildArtifactPath(artifactDir, runtime);
fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
console.log(
    JSON.stringify({ artifactPath, total: rows.length * repetitions, repetitions }, null, 2),
);
