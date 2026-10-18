use apache_avro::{Schema, to_avro_datum, to_value};
use axum::{
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use prost::Message;
use serde::Serialize;
use std::sync::OnceLock;

pub fn avro_small_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"SmallPayload","fields":[{"name":"id","type":"int"},{"name":"name","type":"string"},{"name":"value","type":"float"},{"name":"active","type":"boolean"},{"name":"description","type":"string"},{"name":"timestamp","type":"long"}]}"#).unwrap())
}

pub fn avro_collection_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"CollectionPayload","fields":[{"name":"items","type":{"type":"array","items":{"type":"record","name":"Item","fields":[{"name":"id","type":"int"},{"name":"code","type":"string"},{"name":"price","type":"double"},{"name":"quantity","type":"int"},{"name":"category","type":"string"},{"name":"details","type":["null",{"type":"record","name":"ItemDetails","fields":[{"name":"manufacturer","type":"string"},{"name":"weight","type":"string"}]}],"default":null}]}}}]}"#).unwrap())
}

pub fn avro_nested_schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| Schema::parse_str(r#"{"type":"record","name":"NestedLevel1","fields":[{"name":"next","type":["null",{"type":"record","name":"NestedLevel2","fields":[{"name":"next","type":["null",{"type":"record","name":"NestedLevel3","fields":[{"name":"next","type":["null",{"type":"record","name":"NestedLevel4","fields":[{"name":"next","type":["null",{"type":"record","name":"NestedLevel5","fields":[{"name":"leaf","type":"string"}]}],"default":null}]}],"default":null}]}],"default":null}]}],"default":null}]}"#).unwrap())
}

pub fn encode_avro<T: Serialize>(schema: &Schema, data: T) -> Result<Vec<u8>, apache_avro::Error> {
    to_avro_datum(schema, to_value(data)?)
}

pub enum SerializationFormat {
    Json,
    MsgPack,
    Protobuf,
    Avro,
}

pub struct BenchResponse<'a, T> {
    pub data: &'a T,
    pub format: SerializationFormat,
}

impl<T> IntoResponse for BenchResponse<'_, T>
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
                let body = match rmp_serde::to_vec_named(&self.data) {
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
            SerializationFormat::Avro => unreachable!("Avro responses use dedicated handlers"),
        }
    }
}
