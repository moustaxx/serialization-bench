import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const baseUrl = __ENV.BENCH_URL || "http://127.0.0.1:3000";
const format = __ENV.BENCH_FORMAT || "json";
const scenario = __ENV.BENCH_SCENARIO || "s1";
const profile = __ENV.BENCH_PROFILE || "steady";
const operation = __ENV.BENCH_OPERATION || "serialize";
const validation = __ENV.BENCH_VALIDATION || "with";
const warmupSeconds = Number(__ENV.BENCH_WARMUP_SECONDS || 10);
const durationSeconds = Number(__ENV.BENCH_DURATION_SECONDS || 30);
const warmupVUs = Number(__ENV.BENCH_WARMUP_VUS || 1);
const measurementVUs = Number(__ENV.BENCH_VUS || 4);
const outputPath = __ENV.K6_SUMMARY || `bench/artifacts/k6-${profile}-${Date.now()}.json`;
const isBaselineScenario = scenario === "s12";
const route = isBaselineScenario
    ? "baseline"
    : operation === "deserialize"
      ? "deserialize"
      : "bench";
const endpoint = isBaselineScenario
    ? `${baseUrl}/baseline`
    : `${baseUrl}/${route}/${format}/${scenario}?validation=${validation}`;
const responseBytes = new Trend("response_bytes");
const requestBytes = new Trend("request_bytes");
const responseBytesTotal = new Counter("response_bytes_total");
const requestBytesTotal = new Counter("request_bytes_total");
const expectedContentTypes = {
    json: "application/json",
    msgpack: "application/msgpack",
    protobuf: "application/x-protobuf",
    avro: "application/avro",
    csv: "text/csv",
};
const expectedResponseContentType =
    operation === "deserialize"
        ? "text/plain"
        : isBaselineScenario
          ? "text/plain"
          : expectedContentTypes[format];

if (!["steady", "step", "cold-warm"].includes(profile)) {
    throw new Error(`Unsupported BENCH_PROFILE=${profile}`);
}
if (!expectedContentTypes[format]) {
    throw new Error(`Unsupported BENCH_FORMAT=${format}`);
}
if (!["serialize", "deserialize"].includes(operation)) {
    throw new Error(`Unsupported BENCH_OPERATION=${operation}`);
}
if (isBaselineScenario && operation !== "serialize") {
    throw new Error("S12 baseline does not support deserialization");
}
if (!["with", "without"].includes(validation)) {
    throw new Error(`Unsupported BENCH_VALIDATION=${validation}`);
}
if (!Number.isFinite(warmupSeconds) || warmupSeconds < 0) {
    throw new Error("BENCH_WARMUP_SECONDS must be non-negative");
}
if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("BENCH_DURATION_SECONDS must be positive");
}
if (!Number.isInteger(warmupVUs) || warmupVUs < 1) {
    throw new Error("BENCH_WARMUP_VUS must be a positive integer");
}
if (!Number.isInteger(measurementVUs) || measurementVUs < 1) {
    throw new Error("BENCH_VUS must be a positive integer");
}

const stages = [
    { duration: "15s", target: 2 },
    { duration: "15s", target: 4 },
    { duration: "15s", target: 8 },
    { duration: "15s", target: 0 },
];
const measurementDurationSeconds =
    profile === "step"
        ? stages.reduce((total, stage) => total + Number.parseInt(stage.duration, 10), 0)
        : profile === "cold-warm"
          ? 101
          : durationSeconds;

const measurementOptions =
    profile === "step"
        ? {
              executor: "ramping-vus",
              startVUs: 1,
              stages,
              gracefulRampDown: "5s",
          }
        : {
              executor: "constant-vus",
              vus: measurementVUs,
              duration: `${durationSeconds}s`,
          };

const scenarios =
    profile === "cold-warm"
        ? {
              coldWarm: {
                  executor: "shared-iterations",
                  vus: 1,
                  iterations: 1010,
                  maxDuration: `${Math.max(120, warmupSeconds + durationSeconds)}s`,
                  startTime: `${warmupSeconds}s`,
                  exec: "coldWarm",
              },
          }
        : {
              measurement: {
                  ...measurementOptions,
                  startTime: `${warmupSeconds}s`,
                  exec: "measurement",
              },
          };

if (warmupSeconds > 0) {
    scenarios.warmup = {
        executor: "constant-vus",
        vus: warmupVUs,
        duration: `${warmupSeconds}s`,
        exec: "warmup",
    };
}

export const options = {
    scenarios,
    thresholds: {
        "http_req_failed{phase:measurement}": ["rate<0.01"],
        "http_req_duration{phase:measurement}": ["p(95)<5000"],
    },
    tags: {
        runtime: __ENV.BENCH_RUNTIME || "bun",
        format,
        scenario,
        profile,
    },
};

function request(phase, payload) {
    const params = {
        tags: { phase, operation, validation },
        headers:
            operation === "deserialize"
                ? { "Content-Type": expectedContentTypes[format] }
                : undefined,
    };
    const response =
        operation === "deserialize"
            ? http.post(endpoint, payload, params)
            : http.get(endpoint, params);
    if (operation === "deserialize") {
        requestBytes.add(payload?.length ?? 0, { phase, format, scenario });
        requestBytesTotal.add(payload?.length ?? 0, { phase, format, scenario });
    }
    responseBytes.add(response.body?.length ?? 0, { phase, format, scenario });
    responseBytesTotal.add(response.body?.length ?? 0, { phase, format, scenario });
    check(response, {
        "status is 200": (res) => res.status === 200,
        "content type matches operation": (res) =>
            res.headers["Content-Type"]?.startsWith(expectedResponseContentType),
        "payload is not empty": (res) => (res.body?.length ?? 0) > 0,
    });
}

export function setup() {
    if (operation === "deserialize") {
        const response = http.get(`${baseUrl}/bench/${format}/${scenario}`);
        if (response.status !== 200)
            throw new Error(`Payload preparation failed: ${response.status}`);
        return response.body;
    }
    return null;
}

export function warmup(payload) {
    request("warmup", payload);
    sleep(0.1);
}

export function measurement(payload) {
    request("measurement", payload);
    sleep(0.1);
}

export function coldWarm(payload) {
    const phase = __ITER < 10 ? "cold" : "warm";
    request(phase, payload);
    sleep(0.1);
}

export function handleSummary(data) {
    const artifact = {
        meta: {
            generatedAt: new Date().toISOString(),
            runtime: __ENV.BENCH_RUNTIME || "bun",
            serverUrl: baseUrl,
            endpoint,
            format,
            scenario,
            operation,
            validation,
            profile,
            warmupSeconds,
            measurementDurationSeconds,
            warmupVUs,
            measurementVUs: profile === "steady" ? measurementVUs : null,
            stages: profile === "step" ? stages : null,
            contract: "GET /bench/{format}/{scenario}, POST /deserialize/{format}/{scenario}",
            bytesPerSecond: {
                response: data.metrics.response_bytes_total?.rate ?? null,
                request: data.metrics.request_bytes_total?.rate ?? null,
            },
        },
        metrics: data,
    };

    return {
        [outputPath]: JSON.stringify(artifact, null, 2),
    };
}
