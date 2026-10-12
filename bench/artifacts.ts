import crypto from "node:crypto";
import path from "node:path";

export function buildArtifactPath(artifactDir: string, runtime: string): string {
    return path.join(artifactDir, `bench-${runtime}-${Date.now()}-${crypto.randomUUID()}.json`);
}
