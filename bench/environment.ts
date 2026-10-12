import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveServerDirectory } from "./contract.ts";

function commandVersion(command: string, args: string[]): string | null {
    try {
        return execFileSync(command, args, { encoding: "utf8" }).trim();
    } catch {
        return null;
    }
}

function resolvedRustPackages(rustDir: string): Record<string, string> | null {
    try {
        const metadata = JSON.parse(
            execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--no-deps"], {
                cwd: rustDir,
                encoding: "utf8",
            }),
        ) as { packages?: Array<{ name: string; version: string }> };
        return Object.fromEntries(
            (metadata.packages ?? []).map((packageInfo) => [packageInfo.name, packageInfo.version]),
        );
    } catch {
        return null;
    }
}

export function collectEnvironmentMetadata(repoRoot: string) {
    const bunDir = resolveServerDirectory(repoRoot, "bun");
    const rustDir = resolveServerDirectory(repoRoot, "rust");
    const bunPackage = JSON.parse(fs.readFileSync(path.join(bunDir, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    const rustManifest = fs.readFileSync(path.join(rustDir, "Cargo.toml"), "utf8");
    const bunLockPath = path.join(bunDir, "bun.lock");
    const rustLockPath = path.join(rustDir, "Cargo.lock");

    return {
        revision: commandVersion("git", ["-C", repoRoot, "rev-parse", "HEAD"]),
        dirty: Boolean(commandVersion("git", ["-C", repoRoot, "status", "--short"])),
        host: {
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            cpuCount: os.cpus().length,
        },
        tools: {
            bun: commandVersion("bun", ["--version"]),
            rustc: commandVersion("rustc", ["--version"]),
            cargo: commandVersion("cargo", ["--version"]),
            k6: commandVersion("k6", ["version"]),
            node: commandVersion("node", ["--version"]),
        },
        libraries: {
            bun: {
                declared: {
                    ...bunPackage.dependencies,
                    ...bunPackage.devDependencies,
                },
                resolved: commandVersion("bun", ["pm", "ls", "--all"]),
                lockfileSha256: commandVersion("sha256sum", [bunLockPath]),
            },
            rustManifestSha256: commandVersion("sha256sum", [path.join(rustDir, "Cargo.toml")]),
            rustLockfileSha256: commandVersion("sha256sum", [rustLockPath]),
            rustResolved: resolvedRustPackages(rustDir),
            rustDependenciesDeclared: rustManifest.includes("[dependencies]"),
        },
    };
}

export function assertArtifactMetadata(meta: Record<string, unknown>) {
    const required = ["generatedAt", "runtime", "executionMode", "rejectionRule", "environment"];
    const missing = required.filter((key) => meta[key] === undefined || meta[key] === null);
    if (missing.length) throw new Error(`Artifact metadata is incomplete: ${missing.join(", ")}`);
}
