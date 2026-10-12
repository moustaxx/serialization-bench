# server-bun

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

This server is the Bun implementation used by the serialization benchmark.

# Bun Implementation Walkthrough

This document summarizes the implementation of the Bun part of the serialization benchmarking project.

## Key Changes

### 1. Project Setup

The project lives in `server-bun/`. Its serialization dependencies are:

- `msgpackr` (MessagePack)
- `protobufjs` (Protocol Buffers)
- `avsc` (Apache Avro)
- `papaparse` (CSV)

### 2. Data Models ([models.ts](server-bun/src/models.ts))

Implemented data models and generators that exactly mirror the Rust implementation. This includes:

- `SmallPayload` (S1)
- `CollectionPayload` (S2/S3)
- `NestedLevel1` (S4)
- `ArrayPayload` (S5)

### 3. Serialization Logic ([serialization.ts](server-bun/src/serialization.ts))

Implemented generic serializers and deserializers for all formats.

- **Protobuf**: Defined the schema using `protobufjs` Root JSON.
- **Avro**: Defined the schema using `avsc`.
- **CSV**: Handled flattening of complex objects for CSV representation.

### 4. Native Bun Server ([index.ts](server-bun/src/index.ts))

Used `Bun.serve` for maximum performance.

- Implemented `GET /bench/:format/:scenario` endpoints.
- Implemented `POST /deserialize/{format}/{scenario}` for S8.
- Implemented `GET /baseline` for baseline measurements (S12).

CSV collection payloads flatten `details` into `manufacturer` and `weight` columns.
Avro is encoded as one datum using a predefined schema shared by the scenarios.

## Verification Results

The server was started and tested using `curl`. All endpoints returned the expected data and content types:

| Format   | Endpoint             | Result              |
| :------- | :------------------- | :------------------ |
| JSON     | `/bench/json/s1`     | Success (127 bytes) |
| MsgPack  | `/bench/msgpack/s1`  | Success (105 bytes) |
| Protobuf | `/bench/protobuf/s1` | Success (59 bytes)  |
| Avro     | `/bench/avro/s1`     | Success (53 bytes)  |
| CSV      | `/bench/csv/s1`      | Success (110 bytes) |
| Baseline | `/baseline`          | Success             |

## How to Run

To start the Bun server:

```bash
cd server-bun
bun run src/index.ts
```

The server will be available at `http://localhost:3000`.
