import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const repetitions = Number(process.env.BENCH_REPETITIONS ?? "3");
const seriesId = process.env.BENCH_SERIES_ID ?? new Date().toISOString().replace(/[:.]/g, "-");

if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("BENCH_REPETITIONS must be a positive integer");
}

function runRepetition(repetition: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn("bun", ["run", path.join(repoRoot, "bench/run-k6.ts")], {
            cwd: repoRoot,
            env: {
                ...process.env,
                BENCH_SERIES_ID: seriesId,
                BENCH_REPETITION: String(repetition),
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout?.pipe(process.stdout);
        child.stderr?.pipe(process.stderr);
        child.on("error", reject);
        child.on("close", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new Error(
                    `Benchmark repetition ${repetition} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
                ),
            );
        });
    });
}

for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    await runRepetition(repetition);
}

console.log(JSON.stringify({ seriesId, repetitions }, null, 2));
