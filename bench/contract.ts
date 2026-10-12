export const expectedContentTypes = {
    json: "application/json",
    msgpack: "application/msgpack",
    protobuf: "application/x-protobuf",
    avro: "application/avro",
    csv: "text/csv",
};

export type BenchmarkFormat = keyof typeof expectedContentTypes;
export type BenchmarkOperation = "serialize" | "deserialize";
export type BenchmarkRuntime = "bun" | "rust";

export function calculateBytesPerSecond(payloadBytes: number, elapsedMs: number): number | null {
    return elapsedMs > 0 ? (payloadBytes * 1000) / elapsedMs : null;
}

export function resolveServerDirectory(repoRoot: string, runtime: BenchmarkRuntime): string {
    return `${repoRoot}/server-${runtime}`;
}

export interface ScenarioPhase {
    name: "cold" | "warm";
    iterations: number;
}

export function buildBenchmarkEndpoint(
    baseUrl: string,
    format: BenchmarkFormat,
    scenario: string,
    operation: BenchmarkOperation,
): string {
    if (scenario === "s12") return `${baseUrl}/baseline`;
    const route = operation === "serialize" ? "bench" : "deserialize";
    return `${baseUrl}/${route}/${format}/${scenario}`;
}

export function getScenarioPhases(profile: string): ScenarioPhase[] {
    if (profile === "cold-warm") {
        return [
            { name: "cold", iterations: 10 },
            { name: "warm", iterations: 1000 },
        ];
    }
    return [{ name: "warm", iterations: 1 }];
}

interface ResponseSnapshot {
    status: number;
    contentType?: string;
    payloadBytes: number;
}

export interface ResponseValidation {
    statusOk: boolean;
    contentTypeOk: boolean;
    nonEmpty: boolean;
    stablePayload: boolean;
}

export function validateBenchResponse(
    first: ResponseSnapshot,
    second: ResponseSnapshot,
    expectedContentType: string,
): ResponseValidation {
    return {
        statusOk: first.status === 200 && second.status === 200,
        contentTypeOk: first.contentType?.startsWith(expectedContentType) ?? false,
        nonEmpty: first.payloadBytes > 0,
        stablePayload: first.payloadBytes === second.payloadBytes,
    };
}

export async function preflightBenchEndpoint(
    baseUrl: string,
    format: BenchmarkFormat,
    scenario: string,
    operation: BenchmarkOperation = "serialize",
): Promise<ResponseValidation> {
    const expectedContentType = scenario === "s12" ? "text/plain" : expectedContentTypes[format];
    if (!expectedContentType) throw new Error(`Unsupported benchmark format: ${format}`);

    const endpoint = buildBenchmarkEndpoint(baseUrl, format, scenario, operation);
    if (operation === "deserialize") {
        const payloadResponse = await fetch(
            buildBenchmarkEndpoint(baseUrl, format, scenario, "serialize"),
        );
        const payload = await payloadResponse.arrayBuffer();
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": expectedContentType },
            body: payload,
        });
        if (response.status !== 200) {
            throw new Error(
                `Validation failed for ${format}/${scenario}: POST returned ${response.status}`,
            );
        }
        return {
            statusOk: true,
            contentTypeOk: true,
            nonEmpty: true,
            stablePayload: true,
        };
    }
    const firstResponse = await fetch(endpoint);
    const firstPayload = Buffer.from(await firstResponse.arrayBuffer());
    const secondResponse = await fetch(endpoint);
    const secondPayload = Buffer.from(await secondResponse.arrayBuffer());
    const validation = validateBenchResponse(
        {
            status: firstResponse.status,
            contentType: firstResponse.headers.get("content-type") ?? "",
            payloadBytes: firstPayload.length,
        },
        {
            status: secondResponse.status,
            payloadBytes: secondPayload.length,
        },
        expectedContentType,
    );

    const responseIsValid =
        validation.statusOk &&
        validation.contentTypeOk &&
        validation.nonEmpty &&
        validation.stablePayload;

    if (!responseIsValid) {
        const validationDetails = JSON.stringify(validation);
        throw new Error(`Validation failed for ${format}/${scenario}: ${validationDetails}`);
    }

    return validation;
}
