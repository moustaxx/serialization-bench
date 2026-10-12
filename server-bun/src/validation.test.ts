import assert from "node:assert/strict";
import test from "node:test";

import { validateCsvRows } from "./serialization";

test("accepts flattened CSV rows for a collection", () => {
    assert.equal(
        validateCsvRows(
            [
                {
                    id: "1",
                    code: "CODE-0001",
                    price: "1.5",
                    quantity: "2",
                    category: "Electronics",
                    manufacturer: "RustCorp",
                    weight: "1.2kg",
                },
            ],
            "s2",
        ),
        true,
    );
});

test("rejects CSV rows without the scenario columns", () => {
    assert.equal(validateCsvRows([{ id: "1" }], "s2"), false);
});

test("accepts scalar CSV rows for S1 and S5", () => {
    assert.equal(
        validateCsvRows(
            [
                {
                    id: "1",
                    name: "Test Object",
                    value: "1",
                    active: "true",
                    description: "x",
                    timestamp: "1",
                },
            ],
            "s1",
        ),
        true,
    );
    assert.equal(validateCsvRows([{ "0": "1" }], "s5"), true);
});
