import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { buildArtifactPath } from "./artifacts.ts";
import {
    buildBenchmarkEndpoint,
    calculateBytesPerSecond,
    getScenarioPhases,
    preflightBenchEndpoint,
    resolveServerDirectory,
    validateBenchResponse,
} from "./contract.ts";
import { assertArtifactMetadata } from "./environment.ts";

test("rejects incomplete artifact metadata", () => {
    assert.throws(
        () => assertArtifactMetadata({ runtime: "bun" }),
        /Artifact metadata is incomplete: generatedAt, executionMode, rejectionRule, environment/,
    );
});

test("builds unique artifact paths", () => {
    const first = buildArtifactPath("/tmp/bench-artifacts", "bun");
    const second = buildArtifactPath("/tmp/bench-artifacts", "bun");

    assert.notEqual(first, second);
    assert.match(first, /bench-bun-/);
    assert.match(second, /bench-bun-/);
});

test("builds the serialization and deserialization endpoints", () => {
    assert.equal(
        buildBenchmarkEndpoint("http://127.0.0.1:3000", "json", "s1", "serialize"),
        "http://127.0.0.1:3000/bench/json/s1",
    );
    assert.equal(
        buildBenchmarkEndpoint("http://127.0.0.1:3000", "json", "s1", "deserialize"),
        "http://127.0.0.1:3000/deserialize/json/s1",
    );
});

test("builds the S12 baseline endpoint", () => {
    assert.equal(
        buildBenchmarkEndpoint("http://127.0.0.1:3000", "json", "s12", "serialize"),
        "http://127.0.0.1:3000/baseline",
    );
});

test("defines cold and warm phases for S9", () => {
    assert.deepEqual(getScenarioPhases("cold-warm"), [
        { name: "cold", iterations: 10 },
        { name: "warm", iterations: 1000 },
    ]);
});

test("resolves the current server directories", () => {
    assert.equal(resolveServerDirectory("/repo", "bun"), "/repo/server-bun");
    assert.equal(resolveServerDirectory("/repo", "rust"), "/repo/server-rust");
});
import { type AddressInfo } from "node:net";

test("accepts a stable response with the expected content type", () => {
    const validation = validateBenchResponse(
        { status: 200, contentType: "application/json; charset=utf-8", payloadBytes: 42 },
        { status: 200, payloadBytes: 42 },
        "application/json",
    );

    assert.deepEqual(validation, {
        statusOk: true,
        contentTypeOk: true,
        nonEmpty: true,
        stablePayload: true,
    });
});

test("rejects a response with a wrong content type or unstable payload", () => {
    const validation = validateBenchResponse(
        { status: 200, contentType: "text/plain", payloadBytes: 42 },
        { status: 200, payloadBytes: 41 },
        "application/json",
    );

    assert.equal(validation.statusOk, true);
    assert.equal(validation.contentTypeOk, false);
    assert.equal(validation.nonEmpty, true);
    assert.equal(validation.stablePayload, false);
});

test("calculates response bytes per second from a measured request", () => {
    assert.equal(calculateBytesPerSecond(4096, 200), 20480);
});

test("preflight validates a real endpoint before load testing", async () => {
    const server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"ok":true}');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve as () => void));
    const { port } = server.address() as AddressInfo;

    await assert.doesNotReject(preflightBenchEndpoint(`http://127.0.0.1:${port}`, "json", "s1"));

    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(null))),
    );
});

test("preflight validates the S12 baseline endpoint", async () => {
    const server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("baseline");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve as () => void));
    const { port } = server.address() as AddressInfo;

    await assert.doesNotReject(preflightBenchEndpoint(`http://127.0.0.1:${port}`, "json", "s12"));

    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(null))),
    );
});

test("preflight validates a deserialization endpoint with a prepared payload", async () => {
    const server = createServer((request, response) => {
        if (request.method === "GET") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"ok":true}');
            return;
        }
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("OK");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve as () => void));
    const { port } = server.address() as AddressInfo;

    await assert.doesNotReject(
        preflightBenchEndpoint(`http://127.0.0.1:${port}`, "json", "s1", "deserialize"),
    );

    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(undefined))),
    );
});
