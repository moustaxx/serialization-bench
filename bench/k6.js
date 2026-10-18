import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Trend } from "k6/metrics";

const baseUrl = __ENV.BENCH_URL || "http://127.0.0.1:3000";
const format = __ENV.BENCH_FORMAT || "json";
const scenario = __ENV.BENCH_SCENARIO || "s1";
const operation = __ENV.BENCH_OPERATION || "serialize";
const validation = __ENV.BENCH_VALIDATION || "with";
const warmupSeconds = Number(__ENV.BENCH_WARMUP_SECONDS || 10);
const durationSeconds = Number(__ENV.BENCH_DURATION_SECONDS || 30);
const warmupVUs = Number(__ENV.BENCH_WARMUP_VUS || 1);
const measurementVUs = Number(__ENV.BENCH_VUS || 4);
const loadProfile = __ENV.BENCH_LOAD_PROFILE || "constant-vus";
const arrivalRate = Number(__ENV.BENCH_ARRIVAL_RATE || 20);
const maxVUs = Number(__ENV.BENCH_MAX_VUS || Math.max(measurementVUs, arrivalRate));
const sleepSeconds = Number(__ENV.BENCH_SLEEP_SECONDS || 0.1);
const outputPath = __ENV.K6_SUMMARY || `bench/artifacts/k6-${Date.now()}.json`;
const isBaselineScenario = scenario === "baseline";
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
};
const expectedResponseContentType =
    operation === "deserialize"
        ? "text/plain"
        : isBaselineScenario
          ? "text/plain"
          : expectedContentTypes[format];
const sharedFixture =
    operation === "deserialize" && !isBaselineScenario ? open(__ENV.BENCH_FIXTURE_PATH, "b") : null;

if (!expectedContentTypes[format]) {
    throw new Error(`Unsupported BENCH_FORMAT=${format}`);
}
if (!["serialize", "deserialize"].includes(operation)) {
    throw new Error(`Unsupported BENCH_OPERATION=${operation}`);
}
if (isBaselineScenario && operation !== "serialize") {
    throw new Error("Baseline does not support deserialization");
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
if (!["constant-vus", "constant-arrival-rate"].includes(loadProfile)) {
    throw new Error(`Unsupported BENCH_LOAD_PROFILE=${loadProfile}`);
}
if (!Number.isFinite(arrivalRate) || arrivalRate <= 0) {
    throw new Error("BENCH_ARRIVAL_RATE must be positive");
}
if (!Number.isInteger(maxVUs) || maxVUs < 1) {
    throw new Error("BENCH_MAX_VUS must be a positive integer");
}
if (!Number.isFinite(sleepSeconds) || sleepSeconds < 0) {
    throw new Error("BENCH_SLEEP_SECONDS must be non-negative");
}

const measurementDurationSeconds = durationSeconds;
const measurementScenario =
    loadProfile === "constant-arrival-rate"
        ? {
              executor: "constant-arrival-rate",
              rate: arrivalRate,
              timeUnit: "1s",
              duration: `${durationSeconds}s`,
              preAllocatedVUs: measurementVUs,
              maxVUs,
              startTime: `${warmupSeconds}s`,
              exec: "measurement",
          }
        : {
              executor: "constant-vus",
              vus: measurementVUs,
              duration: `${durationSeconds}s`,
              startTime: `${warmupSeconds}s`,
              exec: "measurement",
          };
const scenarios = {
    measurement: measurementScenario,
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
    },
};

function responseBodyBytes(response) {
    const contentLength = Number(response.headers["Content-Length"]);
    return Number.isFinite(contentLength) && contentLength >= 0
        ? contentLength
        : (response.body?.length ?? 0);
}

function request(phase, payload) {
    const requestBody = payload?.body ?? payload;
    const preparedRequestBytes = payload?.bytes;
    const params = {
        tags: { phase, operation, validation },
        headers:
            operation === "deserialize"
                ? { "Content-Type": expectedContentTypes[format] }
                : undefined,
    };
    const response =
        operation === "deserialize"
            ? http.post(endpoint, requestBody, params)
            : http.get(endpoint, params);
    if (operation === "deserialize") {
        const bytes = preparedRequestBytes ?? requestBody?.length ?? 0;
        requestBytes.add(bytes, { phase, format, scenario });
        requestBytesTotal.add(bytes, { phase, format, scenario });
    }
    const bytes = responseBodyBytes(response);
    responseBytes.add(bytes, { phase, format, scenario });
    responseBytesTotal.add(bytes, { phase, format, scenario });
    check(response, {
        "status is 200": (res) => res.status === 200,
        "content type matches operation": (res) =>
            res.headers["Content-Type"]?.startsWith(expectedResponseContentType),
        "payload is not empty": (res) => responseBodyBytes(res) > 0,
    });
}

export function setup() {
    if (operation === "deserialize") {
        return { body: sharedFixture, bytes: sharedFixture.byteLength };
    }
    return null;
}

export function warmup(payload) {
    request("warmup", payload);
    if (loadProfile === "constant-vus" && sleepSeconds > 0) sleep(sleepSeconds);
}

export function measurement(payload) {
    request("measurement", payload);
    if (loadProfile === "constant-vus" && sleepSeconds > 0) sleep(sleepSeconds);
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
            warmupSeconds,
            measurementDurationSeconds,
            warmupVUs,
            measurementVUs,
            loadProfile,
            arrivalRate: loadProfile === "constant-arrival-rate" ? arrivalRate : null,
            maxVUs: loadProfile === "constant-arrival-rate" ? maxVUs : null,
            sleepSeconds: loadProfile === "constant-vus" ? sleepSeconds : 0,
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
