import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { genS1, genS2, genS3 } from "../server-bun/src/models.ts";
import {
    avroCollection,
    avroNested,
    avroSmall,
    deserializers,
    serializers,
} from "../server-bun/src/serialization.ts";
import type { BenchmarkFormat } from "./contract.ts";

export const benchmarkScenarios = ["s1", "s2_100", "s2_1000", "s2_10000", "s3"] as const;
export type BenchmarkScenario = (typeof benchmarkScenarios)[number];

const canonicalData = {
    s1: genS1(),
    s2_100: genS2(100),
    s2_1000: genS2(1000),
    s2_10000: genS2(10000),
    s3: genS3(),
};

function scenarioConfig(scenario: BenchmarkScenario) {
    switch (scenario) {
        case "s1":
            return { data: canonicalData.s1, protobufType: "SmallPayload", avroSchema: avroSmall };
        case "s2_100":
        case "s2_1000":
        case "s2_10000":
            return {
                data: canonicalData[scenario],
                protobufType: "CollectionPayload",
                avroSchema: avroCollection,
            };
        case "s3":
            return { data: canonicalData.s3, protobufType: "NestedLevel1", avroSchema: avroNested };
    }
}

export function getCanonicalData(scenario: BenchmarkScenario): unknown {
    return scenarioConfig(scenario).data;
}

export function getSharedPayload(format: BenchmarkFormat, scenario: BenchmarkScenario): Buffer {
    const config = scenarioConfig(scenario);
    switch (format) {
        case "json":
            return serializers.json(config.data);
        case "msgpack":
            return serializers.msgpack(config.data);
        case "protobuf":
            return serializers.protobuf(config.data, config.protobufType);
        case "avro":
            return serializers.avro(config.data, config.avroSchema);
    }
}

export function decodeBenchmarkPayload(
    format: BenchmarkFormat,
    scenario: BenchmarkScenario,
    payload: Buffer,
): unknown {
    const config = scenarioConfig(scenario);
    switch (format) {
        case "json":
            return deserializers.json(payload);
        case "msgpack":
            return deserializers.msgpack(payload);
        case "protobuf":
            return deserializers.protobuf(payload, config.protobufType);
        case "avro":
            return deserializers.avro(payload, config.avroSchema);
    }
}

function normalize(value: unknown, propertyName?: string): unknown {
    if (value && typeof value === "object" && "toNumber" in value) {
        return (value as { toNumber: () => number }).toNumber();
    }
    if (typeof value === "number" && propertyName === "value") return Math.fround(value);
    if (Array.isArray(value)) return value.map((item) => normalize(item));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, normalize(nested, key)]),
        );
    }
    return value;
}

export function matchesCanonicalFixture(
    format: BenchmarkFormat,
    scenario: BenchmarkScenario,
    payload: Buffer,
): boolean {
    return (
        JSON.stringify(normalize(decodeBenchmarkPayload(format, scenario, payload))) ===
        JSON.stringify(normalize(getCanonicalData(scenario)))
    );
}

export function ensureSharedFixtureFile(
    format: BenchmarkFormat,
    scenario: BenchmarkScenario,
): string {
    const directory = path.join(os.tmpdir(), "magisterka-bench-fixtures");
    fs.mkdirSync(directory, { recursive: true });
    const filePath = path.join(directory, `${format}-${scenario}.bin`);
    fs.writeFileSync(filePath, getSharedPayload(format, scenario));
    return filePath;
}
