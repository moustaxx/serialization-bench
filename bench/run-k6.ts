import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
    preflightBenchEndpoint,
    type BenchmarkFormat,
    type BenchmarkOperation,
} from "./contract.ts";
import { assertArtifactMetadata, collectEnvironmentMetadata } from "./environment.ts";
import { ensureSharedFixtureFile, type BenchmarkScenario } from "./fixtures.ts";
import {
    startResourceSampling,
    summarizeResourceSamples,
    type ResourceStats,
} from "./process-metrics.ts";
import { startServer, type Runtime } from "./server-runner.ts";

interface K6RunResult {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
}

interface K6Artifact {
    meta: Record<string, unknown>;
    metrics: Record<string, unknown>;
}

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const artifactDir = path.join(repoRoot, "bench", "artifacts");
const runtime = (process.env.BENCH_RUNTIME ?? "bun") as Runtime;
const port = process.env.BENCH_PORT ?? "3000";
const baseUrl = process.env.BENCH_URL ?? `http://127.0.0.1:${port}`;
const format = (process.env.BENCH_FORMAT ?? "json") as BenchmarkFormat;
const scenario = process.env.BENCH_SCENARIO ?? "s1";
const operation = (process.env.BENCH_OPERATION ?? "serialize") as BenchmarkOperation;
const validation = process.env.BENCH_VALIDATION ?? "with";
const warmupSeconds = process.env.BENCH_WARMUP_SECONDS ?? "10";
const durationSeconds = process.env.BENCH_DURATION_SECONDS ?? "30";
const warmupVUs = process.env.BENCH_WARMUP_VUS ?? "1";
const measurementVUs = process.env.BENCH_VUS ?? "4";
const loadProfile = process.env.BENCH_LOAD_PROFILE ?? "constant-vus";
const arrivalRate = process.env.BENCH_ARRIVAL_RATE ?? "20";
const maxVUs =
    process.env.BENCH_MAX_VUS ??
    (loadProfile === "constant-arrival-rate" ? arrivalRate : measurementVUs);
const sleepSeconds = process.env.BENCH_SLEEP_SECONDS ?? "0.1";
const seriesId = process.env.BENCH_SERIES_ID ?? null;
const repetition = process.env.BENCH_REPETITION ?? null;
const k6Output = path.join("/tmp", `k6-${process.pid}.json`);
const fixturePath =
    operation === "deserialize" && scenario !== "baseline"
        ? ensureSharedFixtureFile(format, scenario as BenchmarkScenario)
        : "";

if (!["bun", "rust"].includes(runtime)) {
    throw new Error(`Unsupported BENCH_RUNTIME=${runtime}; use bun or rust`);
}

function runK6(): Promise<K6RunResult> {
    const args = [
        "run",
        "-e",
        `BENCH_URL=${baseUrl}`,
        "-e",
        `BENCH_RUNTIME=${runtime}`,
        "-e",
        `BENCH_FORMAT=${format}`,
        "-e",
        `BENCH_SCENARIO=${scenario}`,
        "-e",
        `BENCH_OPERATION=${operation}`,
        "-e",
        `BENCH_VALIDATION=${validation}`,
        "-e",
        `BENCH_WARMUP_SECONDS=${warmupSeconds}`,
        "-e",
        `BENCH_DURATION_SECONDS=${durationSeconds}`,
        "-e",
        `BENCH_WARMUP_VUS=${warmupVUs}`,
        "-e",
        `BENCH_VUS=${measurementVUs}`,
        "-e",
        `BENCH_LOAD_PROFILE=${loadProfile}`,
        "-e",
        `BENCH_ARRIVAL_RATE=${arrivalRate}`,
        "-e",
        `BENCH_MAX_VUS=${maxVUs}`,
        "-e",
        `BENCH_SLEEP_SECONDS=${sleepSeconds}`,
        "-e",
        `BENCH_FIXTURE_PATH=${fixturePath}`,
        "-e",
        `K6_SUMMARY=${k6Output}`,
        path.join(repoRoot, "bench/k6.js"),
    ];
    return new Promise((resolve, reject) => {
        const k6Process = spawn("k6", args, {
            cwd: repoRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";

        k6Process.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        k6Process.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        k6Process.on("error", reject);
        k6Process.on("close", (status, signal) => {
            resolve({ status, signal, stdout, stderr });
        });
    });
}

let server: Awaited<ReturnType<typeof startServer>> | undefined;
let resourceSampling: ReturnType<typeof startResourceSampling> | undefined;
let resourceStats: ResourceStats | undefined;

try {
    server = await startServer({ repoRoot, runtime, baseUrl });
    await preflightBenchEndpoint(baseUrl, format, scenario, operation);

    resourceSampling = startResourceSampling(server.child.pid as number);
    const k6 = await runK6();
    const measurementEndedAt = new Date();
    resourceStats = resourceSampling.stop();

    if (k6.status !== 0) {
        throw new Error(`k6 failed with exit code ${k6.status}\n${k6.stdout}\n${k6.stderr}`);
    }

    const k6Results = JSON.parse(fs.readFileSync(k6Output, "utf8")) as K6Artifact;
    k6Results.meta.resourceSampling = {
        source: "/proc",
        intervalMs: 100,
        ...resourceStats,
    };
    const measurementStartedAt = new Date(
        measurementEndedAt.getTime() - Number(durationSeconds) * 1000,
    );
    k6Results.meta.measurementResourceSampling = {
        source: "/proc",
        intervalMs: 100,
        window: "estimated from k6 measurement duration ending at runner stop",
        from: measurementStartedAt.toISOString(),
        to: measurementEndedAt.toISOString(),
        ...summarizeResourceSamples(
            resourceStats.samples,
            measurementStartedAt,
            measurementEndedAt,
        ),
    };
    k6Results.meta.runner = "bench/run-k6.ts";
    k6Results.meta.runtime = runtime;
    k6Results.meta.operation = operation;
    k6Results.meta.validation = validation;
    k6Results.meta.seriesId = seriesId;
    k6Results.meta.repetition = repetition;
    k6Results.meta.executionMode =
        runtime === "rust" ? "cargo run --release" : "bun run src/index.ts";
    k6Results.meta.rejectionRule =
        "Reject the run when k6 measurement thresholds or endpoint checks fail.";
    k6Results.meta.environment = collectEnvironmentMetadata(repoRoot);
    assertArtifactMetadata(k6Results.meta);
    fs.mkdirSync(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `k6-${runtime}-${Date.now()}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(k6Results, null, 2));
    console.log(JSON.stringify({ artifactPath, runtime, format, scenario }, null, 2));
} finally {
    if (resourceSampling && !resourceStats) {
        resourceStats = resourceSampling.stop();
    }
    if (server) {
        server.stop();
        const serverOutput = server.getOutput().trim();
        if (serverOutput) {
            console.log(serverOutput);
        }
    }
    if (fs.existsSync(k6Output)) {
        fs.unlinkSync(k6Output);
    }
}
