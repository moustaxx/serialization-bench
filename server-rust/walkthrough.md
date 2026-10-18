# server-rust Benchmark Server Implementation

Implemented a high-performance benchmarking server using Axum to compare serialization strategies.

## Changes Made

### 1. Dependency Setup

Updated `Cargo.toml` with:

- `prost`: Protocol Buffers support.
- `rmp-serde`: MessagePack support.
- `apache-avro`: Apache Avro support.

### 2. Data Models ([models.rs](file:///home/mac/Magisterka/rust/src/models.rs))

The project lives in `server-rust/` and defines structs for the selected scenarios S1-S3.

- **S1**: Small object with 6 fields.
- **S2**: Collection of 10,000 items (implementation endpoint `s2`).
- **S3**: Deeply nested structure (5 levels, implementation endpoint `s3`).

### 3. Serialization Logic ([serialization.rs](file:///home/mac/Magisterka/rust/src/serialization.rs) & [handlers.rs](file:///home/mac/Magisterka/rust/src/handlers.rs))

- Implemented generic and specialized handlers for JSON, MessagePack, Protocol Buffers and Avro.
- Added cached Avro schema definitions for single-datum encoding.

### 4. Endpoints ([main.rs](file:///home/mac/Magisterka/rust/src/main.rs))

- `GET /bench/{format}/{scenario}`: Main benchmark endpoints.
- `POST /deserialize/{format}/{scenario}`: Endpoints for testing deserialization performance (E2).
- `GET /baseline`: Minimal plain-text endpoint for baseline measurements.

Avro is not included for the nested implementation endpoint `s3`.

## Verification Results

Verified all formats using `curl`:

- **JSON**: Valid JSON output.
- **MessagePack**: Compact binary output.
- **Protobuf**: Optimized binary output via `prost`.
- **Avro**: Binary output with embedded schema support.
- **E5**: Plain text response from `/baseline`.

```bash
# Example test command
curl -i http://localhost:3000/bench/json/s1
curl -i http://localhost:3000/bench/avro/s1
```
