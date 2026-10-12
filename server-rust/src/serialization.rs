use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use prost::Message;
use serde::Serialize;
use apache_avro::{to_avro_datum, to_value, Schema};
use std::sync::OnceLock;

pub fn avro_small_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"SmallPayload","fields":[{"name":"id","type":"int"},{"name":"name","type":"string"},{"name":"value","type":"float"},{"name":"active","type":"boolean"},{"name":"description","type":"string"},{"name":"timestamp","type":"long"}]}"#).unwrap())
}

pub fn avro_collection_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"CollectionPayload","fields":[{"name":"items","type":{"type":"array","items":{"type":"record","name":"Item","fields":[{"name":"id","type":"int"},{"name":"code","type":"string"},{"name":"price","type":"double"},{"name":"quantity","type":"int"},{"name":"category","type":"string"},{"name":"details","type":["null",{"type":"record","name":"ItemDetails","fields":[{"name":"manufacturer","type":"string"},{"name":"weight","type":"string"}]}],"default":null}]}}}]}"#).unwrap())
}

pub fn avro_array_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"ArrayPayload","fields":[{"name":"data","type":{"type":"array","items":"int"}}]}"#).unwrap())
}

pub fn encode_avro<T: Serialize>(schema: &Schema, data: T) -> Result<Vec<u8>, apache_avro::Error> {
    to_avro_datum(schema, to_value(data)?)
}

pub enum SerializationFormat {
    Json,
    MsgPack,
    Protobuf,
    Avro,
    Csv,
}

pub struct BenchResponse<T> {
    pub data: T,
    pub format: SerializationFormat,
}

impl<T> IntoResponse for BenchResponse<T>
where
    T: Serialize + Message,
{
    fn into_response(self) -> Response {
        match self.format {
            SerializationFormat::Json => {
                let body = match serde_json::to_vec(&self.data) {
                    Ok(b) => b,
                    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                };
                ([(header::CONTENT_TYPE, "application/json")], body).into_response()
            }
            SerializationFormat::MsgPack => {
                let body = match rmp_serde::to_vec(&self.data) {
                    Ok(b) => b,
                    Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                };
                ([(header::CONTENT_TYPE, "application/msgpack")], body).into_response()
            }
            SerializationFormat::Protobuf => {
                let mut body = Vec::new();
                if self.data.encode(&mut body).is_err() {
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
                ([(header::CONTENT_TYPE, "application/x-protobuf")], body).into_response()
            }
            SerializationFormat::Avro => {
                // Avro is complex because it needs a schema.
                // For simplicity in this benchmark, we might use a predefined schema string or derive it.
                // However, apache-avro doesn't easily derive schema from Message trait.
                // We'll use a placeholder for now or a simple implementation.
                StatusCode::NOT_IMPLEMENTED.into_response()
            }
            SerializationFormat::Csv => {
                // CSV implementation for generic T is hard.
                // We'll implement specific handlers for CSV.
                StatusCode::NOT_IMPLEMENTED.into_response()
            }
        }
    }
}
