import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { startServer, type Runtime } from "./server-runner.ts";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

for (const runtime of ["bun", "rust"] as Runtime[]) {
    test(`starts and stops the ${runtime} benchmark server`, async () => {
        const server = await startServer({
            repoRoot,
            runtime,
            baseUrl: "http://127.0.0.1:3000",
        });

        try {
            const baseline = await fetch("http://127.0.0.1:3000/baseline");
            const response = await fetch("http://127.0.0.1:3000/bench/json/s1");

            assert.equal(baseline.status, 200);
            assert.equal(response.status, 200);
            assert.match(await response.text(), /Test Object/);
        } finally {
            server.stop();
        }
    });
}
