# server-rust Benchmark Server Implementation

Implemented a high-performance benchmarking server using Axum to compare serialization strategies.

## Changes Made

### 1. Dependency Setup

Updated `Cargo.toml` with:

- `prost`: Protocol Buffers support.
- `rmp-serde`: MessagePack support.
- `apache-avro`: Apache Avro support.
- `csv`: CSV support.

### 2. Data Models ([models.rs](file:///home/mac/Magisterka/rust/src/models.rs))

The project lives in `server-rust/` and defines structs for scenarios S1-S5 with required attributes for all serialization formats.

- **S1**: Small object with 6 fields.
- **S2/S3**: Collections of 100 or 10,000 items with nesting.
- **S4**: Deeply nested structure (5 levels).
- **S5**: Large array (100,000 integers).

### 3. Serialization Logic ([serialization.rs](file:///home/mac/Magisterka/rust/src/serialization.rs) & [handlers.rs](file:///home/mac/Magisterka/rust/src/handlers.rs))

- Implemented generic and specialized handlers for each format.
- Added cached Avro schema definitions for single-datum encoding.
- Implemented CSV flattening for collection scenarios.

### 4. Endpoints ([main.rs](file:///home/mac/Magisterka/rust/src/main.rs))

- `GET /bench/{format}/{scenario}`: Main benchmark endpoints.
- `POST /deserialize/{format}/{scenario}`: Endpoints for testing deserialization performance (S8).
- `GET /baseline`: Minimal plain-text endpoint for baseline measurements.

CSV collection payloads flatten `details` into `manufacturer` and `weight` columns.
Avro S4 and CSV S4 remain explicitly `not_implemented`.

## Verification Results

Verified all formats using `curl`:

- **JSON**: Valid JSON output.
- **MessagePack**: Compact binary output.
- **Protobuf**: Optimized binary output via `prost`.
- **Avro**: Binary output with embedded schema support.
- **CSV**: Tabular data with headers.
- **S12**: Plain text response.

```bash
# Example test command
curl -i http://localhost:3000/bench/json/s1
curl -i http://localhost:3000/csv/s1
```
