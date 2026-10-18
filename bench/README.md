# Benchmark tooling

This folder stores the benchmark contract and local validation helpers.

## Quick checks

- Matrix artifact: `BENCH_URL=http://127.0.0.1:3000 bun bench/run-bench.ts`
- Bun matrix: `BENCH_RUNTIME=bun bun bench/run-bench.ts`
- Rust matrix: `BENCH_RUNTIME=rust bun bench/run-bench.ts`
- Deserialization (E1): `BENCH_OPERATION=deserialize BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Schema validation variants (E2): `BENCH_VALIDATION=without BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Throughput profile: `BENCH_LOAD_PROFILE=constant-arrival-rate BENCH_ARRIVAL_RATE=100 BENCH_MAX_VUS=32 BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Response-size analysis (E3): included in the `response_bytes` metric.
- Baseline (E4): `BENCH_SCENARIO=baseline BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Three independent repetitions: `BENCH_REPETITIONS=3 BENCH_RUNTIME=rust bun bench/run-series.ts`

The matrix runner performs the correctness preflight before writing its artifact;
it checks status, format-specific Content-Type, non-empty payloads, and stable
payload size across two requests.

Managed k6 artifacts also record the operation, validation mode and
`response_bytes` metric for E1-E3. Deserialization runs also record the
serialized POST body size as `request_bytes`; `response_bytes` always describes
the HTTP response body.

For E2, `BENCH_VALIDATION=without` disables only the additional application
model validation after decoding. It does not remove the format decoder's
required type or schema: Protobuf still decodes with the scenario message type,
and Avro still decodes with the scenario Avro schema.

The k6 runner accepts `BENCH_URL`, `BENCH_RUNTIME`, `BENCH_FORMAT`,
`BENCH_SCENARIO`, `BENCH_OPERATION`, `BENCH_VALIDATION`,
`BENCH_WARMUP_SECONDS`, `BENCH_DURATION_SECONDS`, `BENCH_WARMUP_VUS`,
`BENCH_VUS`, `BENCH_LOAD_PROFILE`, `BENCH_ARRIVAL_RATE`, `BENCH_MAX_VUS`,
`BENCH_SLEEP_SECONDS`, and `K6_SUMMARY`. The default load profile is
`constant-vus`; `constant-arrival-rate` is available for throughput sweeps.
The matrix runner accepts
`BENCH_REPETITIONS` (default `3`). Results are written as JSON with the
selected operation, endpoint, warm-up, load parameters, checks, thresholds,
and raw k6 metrics. The measurement phase is tagged separately from warm-up.
The managed runner starts the selected runtime, waits for `/baseline`, runs
k6 asynchronously, samples the server process, and combines k6 metrics with
CPU/RSS data in one artifact.

`run-series.ts` starts a fresh managed run for each repetition and records
`seriesId` and `repetition` in every resulting artifact. It does not aggregate
the runs; aggregation must preserve the series and configuration metadata.

## Supported matrix

The matrix runner covers all supported combinations of JSON, MessagePack,
Protocol Buffers and Avro with `s1`, `s2_100`, `s2_1000`, `s2_10000`
and `s3`. The S2 scaling variants use 100, 1,000 and 10,000 items.

## Artifact output

Results are stored under `bench/artifacts/` with metadata and raw request timings.
The Rust runner starts `cargo run --release`; set `BENCH_PORT` or `BENCH_URL` when using a different port.
Each artifact also contains `meta.resourceSampling` with `/proc` samples,
average and maximum RSS, and average and maximum process CPU percentage.
Each matrix result also contains `resourceSampling` for its individual
format/scenario request; very short requests may contain only the final sample.
Sampling starts after readiness and covers the matrix request phase; short
matrix runs are correctness checks, not final load measurements.

Compare or aggregate artifacts only when their recorded runtime, dependency
versions, execution mode, host, endpoint contract, load configuration, and revision
match. Artifacts from different configurations or compilation modes must remain
separate.
