import { genS1, genS2, genS3 } from "./models";
import { serializers, deserializers, avroSmall, avroCollection, avroNested } from "./serialization";

const scenarioData = {
    s1: genS1(),
    s2: genS2(),
    s2_100: genS2(100),
    s2_1000: genS2(1000),
    s2_10000: genS2(10000),
    s3: genS3(),
};

const s2Scenarios = new Set(["s2", "s2_100", "s2_1000", "s2_10000"]);

function getScenarioConfig(scenario: string) {
    switch (scenario) {
        case "s1":
            return { data: scenarioData.s1, pbType: "SmallPayload", avroSchema: avroSmall };
        case "s2":
        case "s2_100":
        case "s2_1000":
        case "s2_10000":
            return {
                data: scenarioData[scenario as keyof typeof scenarioData],
                pbType: "CollectionPayload",
                avroSchema: avroCollection,
            };
        case "s3":
            return { data: scenarioData.s3, pbType: "NestedLevel1", avroSchema: avroNested };
        default:
            return null;
    }
}

async function handleBench(format: string, scenario: string) {
    const scenarioConfig = getScenarioConfig(scenario);
    if (!scenarioConfig) return new Response("Not Found", { status: 404 });

    const { data, pbType, avroSchema } = scenarioConfig;
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
    if (scenario === "s1") {
        return "name" in data && typeof data.name === "string" && data.name.length > 0;
    }
    if (s2Scenarios.has(scenario)) {
        return "items" in data && Array.isArray(data.items) && data.items.length > 0;
    }
    if (scenario === "s3") return "next" in data && Boolean(data.next);
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
            default:
                return new Response("Not Implemented", { status: 501 });
        }
        const valid = validateDecodedData(decoded, scenario);
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
