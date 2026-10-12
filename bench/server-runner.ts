import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { resolveServerDirectory } from "./contract.ts";

export type Runtime = "bun" | "rust";

interface StartServerOptions {
    repoRoot: string;
    runtime: Runtime;
    baseUrl: string;
}

export async function startServer({ repoRoot, runtime, baseUrl }: StartServerOptions) {
    const serverDir = resolveServerDirectory(repoRoot, runtime);

    if (runtime === "rust") {
        const build = spawnSync("cargo", ["build", "--release"], {
            cwd: serverDir,
            encoding: "utf8",
        });
        if (build.status !== 0) {
            throw new Error(`Rust release build failed:\n${build.stdout}\n${build.stderr}`);
        }
    }

    const child = spawn(
        runtime === "rust" ? path.join(serverDir, "target/release/rust") : "bun",
        runtime === "rust" ? [] : ["run", "src/index.ts"],
        { cwd: serverDir, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
    });

    await waitForServer(baseUrl);
    return {
        child,
        getOutput: () => output,
        stop: () => child.kill("SIGTERM"),
    };
}

function waitForServer(baseUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setInterval(async () => {
            try {
                const response = await fetch(`${baseUrl}/baseline`);
                if (response.status === 200 && !settled) {
                    settled = true;
                    clearInterval(timer);
                    resolve();
                }
            } catch {
                // Keep polling until the server is ready.
            }
        }, 200);
        setTimeout(() => {
            if (!settled) {
                settled = true;
                clearInterval(timer);
                reject(new Error(`Server not ready at ${baseUrl}`));
            }
        }, 60000);
    });
}
