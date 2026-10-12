# Benchmark tooling

This folder stores the benchmark contract and local validation helpers.

## Quick checks

- Matrix artifact: `BENCH_URL=http://127.0.0.1:3000 bun bench/run-bench.ts`
- Bun matrix: `BENCH_RUNTIME=bun bun bench/run-bench.ts`
- Rust matrix: `BENCH_RUNTIME=rust bun bench/run-bench.ts`
- Steady load (S6): `k6 run -e BENCH_PROFILE=steady bench/k6.js`
- Step load (S7): `k6 run -e BENCH_PROFILE=step bench/k6.js`
- Managed steady run: `BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Deserialization (S8): `BENCH_OPERATION=deserialize BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Cold/warm (S9): `BENCH_PROFILE=cold-warm BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Schema validation variants (S10): `BENCH_VALIDATION=without BENCH_RUNTIME=rust bun bench/run-k6.ts`
- Baseline (S12): `BENCH_SCENARIO=s12 BENCH_RUNTIME=rust bun bench/run-k6.ts`

The matrix runner performs the correctness preflight before writing its artifact;
it checks status, format-specific Content-Type, non-empty payloads, and stable
payload size across two requests.

Managed k6 artifacts also record the operation, validation mode, cold/warm phase,
and `response_bytes` metric for S8-S11. Deserialization runs also record the
serialized POST body size as `request_bytes`; `response_bytes` always describes
the HTTP response body.

For S10, `BENCH_VALIDATION=without` disables only the additional application
model validation after decoding. It does not remove the format decoder's
required type or schema: Protobuf still decodes with the scenario message type,
and Avro still decodes with the scenario Avro schema.

The k6 profile accepts `BENCH_URL`, `BENCH_RUNTIME`, `BENCH_FORMAT`,
`BENCH_SCENARIO`, `BENCH_OPERATION`, `BENCH_VALIDATION`, `BENCH_PROFILE`,
`BENCH_WARMUP_SECONDS`, `BENCH_DURATION_SECONDS`, `BENCH_WARMUP_VUS`,
`BENCH_VUS`, and `K6_SUMMARY`. The matrix runner accepts
`BENCH_REPETITIONS` (default `3`). Results are written as JSON with the
selected profile, endpoint, warm-up, load parameters, checks, thresholds,
and raw k6 metrics. The measurement phase is tagged separately from
warm-up, so its percentiles are not mixed with cold-start requests.
The managed runner starts the selected runtime, waits for `/baseline`, runs
k6 asynchronously, samples the server process, and combines k6 metrics with
CPU/RSS data in one artifact.

## Supported matrix

See [support-matrix.json](support-matrix.json). It records the current status of each runtime/format/scenario combination.

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
versions, execution mode, host, endpoint contract, load profile, and revision
match. Artifacts from different configurations or compilation modes must remain
separate.
