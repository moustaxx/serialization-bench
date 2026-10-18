use crate::models::*;
use crate::serialization::{
    BenchResponse, SerializationFormat, avro_collection_schema, avro_nested_schema,
    avro_small_schema, encode_avro,
};
use axum::{
    extract::Path,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use prost::Message;
use std::collections::HashMap;

pub async fn handle_baseline() -> Response {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "baseline",
    )
        .into_response()
}
pub async fn handle_bench(Path((format, scenario)): Path<(String, String)>) -> Response {
    let format = match format.as_str() {
        "json" => SerializationFormat::Json,
        "msgpack" => SerializationFormat::MsgPack,
        "protobuf" => SerializationFormat::Protobuf,
        "avro" => SerializationFormat::Avro,
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };

    match scenario.as_str() {
        "s1" => {
            let data = &prepared_payloads().s1;
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_s1(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s2" | "s2_100" | "s2_1000" | "s2_10000" => {
            let data = match scenario.as_str() {
                "s2" => &prepared_payloads().s2,
                "s2_100" => &prepared_payloads().s2_100,
                "s2_1000" => &prepared_payloads().s2_1000,
                "s2_10000" => &prepared_payloads().s2_10000,
                _ => unreachable!(),
            };
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_collection(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s3" => {
            let data = &prepared_payloads().s3;
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_nested(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

// Special handlers for Avro and CSV

fn handle_avro_s1(data: &SmallPayload) -> impl IntoResponse {
    let body = encode_avro(avro_small_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

fn handle_avro_collection(data: &CollectionPayload) -> impl IntoResponse {
    let body = encode_avro(avro_collection_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

fn handle_avro_nested(data: &NestedLevel1) -> impl IntoResponse {
    let body = encode_avro(avro_nested_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

// Deserialization test
pub async fn handle_deserialization_test(
    Path((format, scenario)): Path<(String, String)>,
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> Response {
    let validate = params
        .get("validation")
        .map(String::as_str)
        .unwrap_or("with")
        == "with";
    match format.as_str() {
        "json" => match scenario.as_str() {
            "s1" => {
                let value: SmallPayload = match serde_json::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.name.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s2" | "s2_100" | "s2_1000" | "s2_10000" => {
                let value: CollectionPayload = match serde_json::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s3" => {
                let value: NestedLevel1 = match serde_json::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.next.is_none() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            _ => return StatusCode::NOT_FOUND.into_response(),
        },
        "msgpack" => match scenario.as_str() {
            "s1" => {
                let value: SmallPayload = match rmp_serde::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.name.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s2" | "s2_100" | "s2_1000" | "s2_10000" => {
                let value: CollectionPayload = match rmp_serde::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s3" => {
                let value: NestedLevel1 = match rmp_serde::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.next.is_none() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            _ => return StatusCode::NOT_FOUND.into_response(),
        },
        "protobuf" => match scenario.as_str() {
            "s1" => {
                let value = match SmallPayload::decode(body.as_ref()) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.name.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s2" | "s2_100" | "s2_1000" | "s2_10000" => {
                let value = match CollectionPayload::decode(body.as_ref()) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s3" => {
                let value = match NestedLevel1::decode(body.as_ref()) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.next.is_none() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            _ => return StatusCode::NOT_FOUND.into_response(),
        },
        "avro" => {
            let schema = match scenario.as_str() {
                "s1" => avro_small_schema(),
                "s2" | "s2_100" | "s2_1000" | "s2_10000" => avro_collection_schema(),
                "s3" => avro_nested_schema(),
                _ => return StatusCode::NOT_FOUND.into_response(),
            };
            let mut input = body.as_ref();
            let value = match apache_avro::from_avro_datum(schema, &mut input, None) {
                Ok(value) => value,
                Err(_) => return StatusCode::BAD_REQUEST.into_response(),
            };
            if validate && !validate_avro_application_data(&value, &scenario) {
                return StatusCode::BAD_REQUEST.into_response();
            }
        }
        _ => return StatusCode::NOT_IMPLEMENTED.into_response(),
    }
    StatusCode::OK.into_response()
}

fn validate_avro_application_data(value: &apache_avro::types::Value, scenario: &str) -> bool {
    use apache_avro::types::Value;

    let Value::Record(fields) = value else {
        return false;
    };
    match scenario {
        "s1" => fields.iter().any(|(name, value)| {
            name == "name" && matches!(value, Value::String(value) if !value.is_empty())
        }),
        "s2" | "s2_100" | "s2_1000" | "s2_10000" => fields.iter().any(|(name, value)| {
            name == "items" && matches!(value, Value::Array(items) if !items.is_empty())
        }),
        "s3" => fields.iter().any(|(name, value)| {
            name == "next" && matches!(value, Value::Union(index, _) if *index != 0)
        }),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::{handle_bench, handle_deserialization_test};
    use axum::{
        body::Bytes,
        extract::{Path, Query},
        http::StatusCode,
    };
    use std::collections::HashMap;

    #[tokio::test]
    async fn malformed_json_returns_bad_request() {
        let response = handle_deserialization_test(
            Path(("json".to_string(), "s1".to_string())),
            Query(HashMap::new()),
            Bytes::from_static(b"{not-json"),
        )
        .await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn avro_s3_is_supported() {
        crate::models::prepare_payloads();
        let response = handle_bench(Path(("avro".to_string(), "s3".to_string()))).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn avro_s3_payload_is_deserializable() {
        crate::models::prepare_payloads();
        let response = handle_bench(Path(("avro".to_string(), "s3".to_string()))).await;
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let response = handle_deserialization_test(
            Path(("avro".to_string(), "s3".to_string())),
            Query(HashMap::new()),
            body,
        )
        .await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn avro_validation_is_shared_by_with_and_without_variants() {
        let payload = crate::serialization::encode_avro(
            crate::serialization::avro_small_schema(),
            crate::models::SmallPayload {
                name: String::new(),
                ..crate::models::gen_s1()
            },
        )
        .unwrap();

        let mut with = HashMap::new();
        with.insert("validation".to_string(), "with".to_string());
        let with_response = handle_deserialization_test(
            Path(("avro".to_string(), "s1".to_string())),
            Query(with),
            Bytes::from(payload.clone()),
        )
        .await;
        assert_eq!(with_response.status(), StatusCode::BAD_REQUEST);

        let mut without = HashMap::new();
        without.insert("validation".to_string(), "without".to_string());
        let without_response = handle_deserialization_test(
            Path(("avro".to_string(), "s1".to_string())),
            Query(without),
            Bytes::from(payload),
        )
        .await;
        assert_eq!(without_response.status(), StatusCode::OK);
    }
}
