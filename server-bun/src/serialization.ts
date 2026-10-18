import avro from "avsc";
import { Packr } from "msgpackr";
import protobuf from "protobufjs";

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

const avroNested = avro.Type.forSchema({
    type: "record",
    name: "NestedLevel1",
    fields: [
        {
            name: "next",
            type: [
                "null",
                {
                    type: "record",
                    name: "NestedLevel2",
                    fields: [
                        {
                            name: "next",
                            type: [
                                "null",
                                {
                                    type: "record",
                                    name: "NestedLevel3",
                                    fields: [
                                        {
                                            name: "next",
                                            type: [
                                                "null",
                                                {
                                                    type: "record",
                                                    name: "NestedLevel4",
                                                    fields: [
                                                        {
                                                            name: "next",
                                                            type: [
                                                                "null",
                                                                {
                                                                    type: "record",
                                                                    name: "NestedLevel5",
                                                                    fields: [
                                                                        {
                                                                            name: "leaf",
                                                                            type: "string",
                                                                        },
                                                                    ],
                                                                },
                                                            ],
                                                            default: null,
                                                        },
                                                    ],
                                                },
                                            ],
                                            default: null,
                                        },
                                    ],
                                },
                            ],
                            default: null,
                        },
                    ],
                },
            ],
            default: null,
        },
    ],
});

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
        return pbType.toObject(pbType.decode(buf), { defaults: true, longs: Number });
    },
    avro: (buf: Buffer, schema: any) => {
        return schema.fromBuffer(buf);
    },
};

export { avroSmall, avroCollection, avroNested };
