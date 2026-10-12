import avro from "avsc";
import { Packr } from "msgpackr";
import Papa from "papaparse";
import protobuf from "protobufjs";

import type { CollectionPayload, ArrayPayload } from "./models";

// MessagePack
const packr = new Packr();

// Protobuf
const root = protobuf.Root.fromJSON({
    nested: {
        SmallPayload: {
            fields: {
                id: { type: "int32", id: 1 },
                name: { type: "string", id: 2 },
                value: { type: "float", id: 3 },
                active: { type: "bool", id: 4 },
                description: { type: "string", id: 5 },
                timestamp: { type: "int64", id: 6 },
            },
        },
        ItemDetails: {
            fields: {
                manufacturer: { type: "string", id: 1 },
                weight: { type: "string", id: 2 },
            },
        },
        Item: {
            fields: {
                id: { type: "int32", id: 1 },
                code: { type: "string", id: 2 },
                price: { type: "double", id: 3 },
                quantity: { type: "int32", id: 4 },
                category: { type: "string", id: 5 },
                details: { type: "ItemDetails", id: 6 },
            },
        },
        CollectionPayload: {
            fields: {
                items: { rule: "repeated", type: "Item", id: 1 },
            },
        },
        NestedLevel5: { fields: { leaf: { type: "string", id: 1 } } },
        NestedLevel4: { fields: { next: { type: "NestedLevel5", id: 1 } } },
        NestedLevel3: { fields: { next: { type: "NestedLevel4", id: 1 } } },
        NestedLevel2: { fields: { next: { type: "NestedLevel3", id: 1 } } },
        NestedLevel1: { fields: { next: { type: "NestedLevel2", id: 1 } } },
        ArrayPayload: {
            fields: {
                data: { rule: "repeated", type: "int32", id: 1 },
            },
        },
    },
});

// Avro
const avroSmall = avro.Type.forSchema({
    type: "record",
    name: "SmallPayload",
    fields: [
        { name: "id", type: "int" },
        { name: "name", type: "string" },
        { name: "value", type: "float" },
        { name: "active", type: "boolean" },
        { name: "description", type: "string" },
        { name: "timestamp", type: "long" },
    ],
});

const avroCollection = avro.Type.forSchema({
    type: "record",
    name: "CollectionPayload",
    fields: [
        {
            name: "items",
            type: {
                type: "array",
                items: {
                    type: "record",
                    name: "Item",
                    fields: [
                        { name: "id", type: "int" },
                        { name: "code", type: "string" },
                        { name: "price", type: "double" },
                        { name: "quantity", type: "int" },
                        { name: "category", type: "string" },
                        {
                            name: "details",
                            type: [
                                "null",
                                {
                                    type: "record",
                                    name: "ItemDetails",
                                    fields: [
                                        { name: "manufacturer", type: "string" },
                                        { name: "weight", type: "string" },
                                    ],
                                },
                            ],
                            default: null,
                        },
                    ],
                },
            },
        },
    ],
});

const avroArray = avro.Type.forSchema({
    type: "record",
    name: "ArrayPayload",
    fields: [{ name: "data", type: { type: "array", items: "int" } }],
});

const csvFlattenItem = (item: any) => ({
    id: item.id,
    code: item.code,
    price: item.price,
    quantity: item.quantity,
    category: item.category,
    manufacturer: item.details?.manufacturer ?? "",
    weight: item.details?.weight ?? "",
});

export function validateCsvRows(value: unknown, scenario: string): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    const firstRow = value[0];
    if (!firstRow || typeof firstRow !== "object") return false;
    const columns = new Set(Object.keys(firstRow));
    const requiredColumns =
        scenario === "s1"
            ? ["id", "name", "value", "active", "description", "timestamp"]
            : scenario === "s2" || scenario === "s3"
              ? ["id", "code", "price", "quantity", "category", "manufacturer", "weight"]
              : scenario === "s5"
                ? ["0"]
                : [];
    return requiredColumns.length > 0 && requiredColumns.every((column) => columns.has(column));
}

export const serializers = {
    json: (data: any) => {
        return Buffer.from(JSON.stringify(data));
    },
    msgpack: (data: any) => {
        return packr.pack(data);
    },
    protobuf: (data: any, type: string) => {
        const pbType = root.lookupType(type);
        const message = pbType.create(data);
        return Buffer.from(pbType.encode(message).finish());
    },
    avro: (data: any, schema: avro.Type) => {
        return schema.toBuffer(data);
    },
    csv: (data: any, scenario: string) => {
        if (scenario === "s1") {
            return Buffer.from(Papa.unparse([data]));
        }
        if (scenario === "s2" || scenario === "s3") {
            const flatItems = (data as CollectionPayload).items.map(csvFlattenItem);
            return Buffer.from(Papa.unparse(flatItems));
        }
        if (scenario === "s5") {
            const flatData = (data as ArrayPayload).data.map((v) => [v]);
            return Buffer.from(Papa.unparse(flatData));
        }
        throw new Error("CSV not implemented for this scenario");
    },
};

export const deserializers = {
    json: (buf: Buffer) => {
        return JSON.parse(buf.toString());
    },
    msgpack: (buf: Buffer) => {
        return packr.unpack(buf);
    },
    protobuf: (buf: Buffer, type: string) => {
        const pbType = root.lookupType(type);
        return pbType.decode(buf);
    },
    avro: (buf: Buffer, schema: any) => {
        return schema.fromBuffer(buf);
    },
    csv: (buf: Buffer) => {
        return Papa.parse(buf.toString(), { header: true, skipEmptyLines: true }).data;
    },
};

export { avroSmall, avroCollection, avroArray };
