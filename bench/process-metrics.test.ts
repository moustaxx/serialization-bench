import assert from "node:assert/strict";
import test from "node:test";

import { summarizeResourceSamples } from "./process-metrics.ts";

test("summarizes only samples inside the requested measurement window", () => {
    const samples = [
        { at: "2026-10-18T10:00:00.000Z", rssBytes: 100, cpuPercent: 10 },
        { at: "2026-10-18T10:00:01.000Z", rssBytes: 200, cpuPercent: 30 },
        { at: "2026-10-18T10:00:02.000Z", rssBytes: 300, cpuPercent: 50 },
    ];

    const result = summarizeResourceSamples(
        samples,
        new Date("2026-10-18T10:00:01.000Z"),
        new Date("2026-10-18T10:00:02.000Z"),
    );

    assert.equal(result.sampleCount, 2);
    assert.equal(result.rssAverageBytes, 250);
    assert.equal(result.rssMaxBytes, 300);
    assert.equal(result.cpuAveragePercent, 40);
    assert.equal(result.cpuMaxPercent, 50);
});
