import { genS1, genS2, genS3, genS4, genS5 } from "./models";
import {
    serializers,
    deserializers,
    avroSmall,
    avroCollection,
    avroArray,
    validateCsvRows,
} from "./serialization";

const scenarioData = {
    s1: genS1(),
    s2: genS2(),
    s3: genS3(),
    s4: genS4(),
    s5: genS5(),
};

function getScenarioConfig(scenario: string) {
    switch (scenario) {
        case "s1":
            return { data: scenarioData.s1, pbType: "SmallPayload", avroSchema: avroSmall };
        case "s2":
            return {
                data: scenarioData.s2,
                pbType: "CollectionPayload",
                avroSchema: avroCollection,
            };
        case "s3":
            return {
                data: scenarioData.s3,
                pbType: "CollectionPayload",
                avroSchema: avroCollection,
            };
        case "s4":
            return { data: scenarioData.s4, pbType: "NestedLevel1", avroSchema: null };
        case "s5":
            return { data: scenarioData.s5, pbType: "ArrayPayload", avroSchema: avroArray };
        default:
            return null;
    }
}

async function handleBench(format: string, scenario: string) {
    const scenarioConfig = getScenarioConfig(scenario);
    if (!scenarioConfig) return new Response("Not Found", { status: 404 });

    const { data, pbType, avroSchema } = scenarioConfig;
    if (format === "avro" || format === "csv") {
        if (scenario === "s4") {
            return new Response("Not Implemented", { status: 501 });
        }
    }

    let body: Buffer | Uint8Array;
    let contentType = "";

    try {
        switch (format) {
            case "json":
                body = serializers.json(data);
                contentType = "application/json";
                break;
            case "msgpack":
                body = serializers.msgpack(data);
                contentType = "application/msgpack";
                break;
            case "protobuf":
                body = serializers.protobuf(data, pbType);
                contentType = "application/x-protobuf";
                break;
            case "avro":
                if (!avroSchema) throw new Error("AVRO schema missing");
                body = serializers.avro(data, avroSchema);
                contentType = "application/avro";
                break;
            case "csv":
                body = serializers.csv(data, scenario);
                contentType = "text/csv";
                break;
            default:
                return new Response("Bad Request", { status: 400 });
        }
    } catch (error) {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    }

    return new Response(body, { headers: { "Content-Type": contentType } });
}

function validateDecodedData(data: unknown, scenario: string): boolean {
    if (!data || typeof data !== "object") return false;
    if (scenario === "s1") return "id" in data && "name" in data;
    if (scenario === "s2" || scenario === "s3") {
        return "items" in data && Array.isArray(data.items) && data.items.length > 0;
    }
    if (scenario === "s4") return "next" in data && Boolean(data.next);
    if (scenario === "s5")
        return "data" in data && Array.isArray(data.data) && data.data.length > 0;
    return false;
}

async function handleDeserialize(
    format: string,
    scenario: string,
    body: Buffer,
    validation: string,
) {
    const scenarioConfig = getScenarioConfig(scenario);
    if (!scenarioConfig) return new Response("Not Found", { status: 404 });

    try {
        let decoded: unknown;
        switch (format) {
            case "json":
                decoded = deserializers.json(body);
                break;
            case "msgpack":
                decoded = deserializers.msgpack(body);
                break;
            case "protobuf":
                decoded = deserializers.protobuf(body, scenarioConfig.pbType);
                break;
            case "avro":
                if (!scenarioConfig.avroSchema)
                    return new Response("Not Implemented", { status: 501 });
                decoded = deserializers.avro(body, scenarioConfig.avroSchema);
                break;
            case "csv":
                if (scenario === "s4") return new Response("Not Implemented", { status: 501 });
                decoded = deserializers.csv(body);
                break;
            default:
                return new Response("Not Implemented", { status: 501 });
        }
        const valid =
            format === "csv"
                ? validateCsvRows(decoded, scenario)
                : validateDecodedData(decoded, scenario);
        if (validation === "with" && !valid) {
            return new Response("Bad Request", { status: 400 });
        }
    } catch (error) {
        console.error(error);
        return new Response("Bad Request", { status: 400 });
    }

    return new Response("OK", { status: 200 });
}

const server = Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/").filter(Boolean);

        if (url.pathname === "/baseline") {
            return new Response("baseline", {
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
        }

        if (pathParts[0] === "bench" && pathParts.length === 3) {
            const format = pathParts[1];
            const scenario = pathParts[2];
            if (!format || !scenario) return new Response("Bad Request", { status: 400 });
            return handleBench(format, scenario);
        }

        if (pathParts[0] === "deserialize" && pathParts.length === 3 && req.method === "POST") {
            const format = pathParts[1];
            const scenario = pathParts[2];
            if (!format || !scenario) return new Response("Bad Request", { status: 400 });
            const body = Buffer.from(await req.arrayBuffer());
            return handleDeserialize(
                format,
                scenario,
                body,
                url.searchParams.get("validation") ?? "with",
            );
        }

        return new Response("Not Found", { status: 404 });
    },
});

console.log(`Bun server running at http://localhost:${server.port}`);
