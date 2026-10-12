import fs from "node:fs";

interface ProcessStats {
    rssBytes: number;
    cpuTicks: number;
}

export interface ResourceSample {
    at: string;
    rssBytes: number;
    cpuPercent: number;
}

export interface ResourceStats {
    samples: ResourceSample[];
    sampleCount: number;
    rssAverageBytes: number | null;
    rssMaxBytes: number | null;
    cpuAveragePercent: number | null;
    cpuMaxPercent: number | null;
}

export function startResourceSampling(
    pid: number,
    intervalMs = 100,
): { stop: () => ResourceStats } {
    const samples: ResourceSample[] = [];
    const ticksPerSecond = 100;
    let previous = readProcessStats(pid);
    let previousTime = process.hrtime.bigint();

    const sample = () => {
        const current = readProcessStats(pid);
        const currentTime = process.hrtime.bigint();
        if (!current) return;

        const elapsedSeconds = Number(currentTime - previousTime) / 1e9;
        const cpuPercent =
            previous && elapsedSeconds > 0
                ? ((current.cpuTicks - previous.cpuTicks) / ticksPerSecond / elapsedSeconds) * 100
                : 0;
        samples.push({
            at: new Date().toISOString(),
            rssBytes: current.rssBytes,
            cpuPercent: Math.max(0, cpuPercent),
        });
        previous = current;
        previousTime = currentTime;
    };

    const timer = setInterval(sample, intervalMs);
    return {
        stop() {
            clearInterval(timer);
            sample();
            const rss = samples.map((item) => item.rssBytes);
            const cpu = samples.map((item) => item.cpuPercent);
            return {
                samples,
                sampleCount: samples.length,
                rssAverageBytes: rss.length
                    ? rss.reduce((sum, value) => sum + value, 0) / rss.length
                    : null,
                rssMaxBytes: rss.length ? Math.max(...rss) : null,
                cpuAveragePercent: cpu.length
                    ? cpu.reduce((sum, value) => sum + value, 0) / cpu.length
                    : null,
                cpuMaxPercent: cpu.length ? Math.max(...cpu) : null,
            };
        },
    };
}

function readProcessStats(pid: number): ProcessStats | null {
    try {
        const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
        const rssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const statFields = stat.slice(stat.lastIndexOf(") ") + 2).split(" ");
        const cpuTicks = Number(statFields[11]) + Number(statFields[12]);
        if (!rssMatch || !Number.isFinite(cpuTicks)) return null;
        return { rssBytes: Number(rssMatch[1]) * 1024, cpuTicks };
    } catch {
        return null;
    }
}
