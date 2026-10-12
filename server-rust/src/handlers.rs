use crate::models::*;
use crate::serialization::{
    BenchResponse, SerializationFormat, avro_array_schema, avro_collection_schema,
    avro_small_schema, encode_avro,
};
use axum::{
    extract::Path,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use prost::Message;
use serde::Serialize;
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
        "csv" => SerializationFormat::Csv,
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };

    match scenario.as_str() {
        "s1" => {
            let data = prepared_payloads().s1.clone();
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_s1(data).into_response();
            }
            if matches!(format, SerializationFormat::Csv) {
                return handle_csv_s1(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s2" => {
            let data = prepared_payloads().s2.clone();
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_collection(data).into_response();
            }
            if matches!(format, SerializationFormat::Csv) {
                return handle_csv_collection(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s3" => {
            let data = prepared_payloads().s3.clone();
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_collection(data).into_response();
            }
            if matches!(format, SerializationFormat::Csv) {
                return handle_csv_collection(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s4" => {
            let data = prepared_payloads().s4.clone();
            if matches!(format, SerializationFormat::Avro)
                || matches!(format, SerializationFormat::Csv)
            {
                return StatusCode::NOT_IMPLEMENTED.into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        "s5" => {
            let data = prepared_payloads().s5.clone();
            if matches!(format, SerializationFormat::Avro) {
                return handle_avro_array(data).into_response();
            }
            if matches!(format, SerializationFormat::Csv) {
                return handle_csv_array(data).into_response();
            }
            BenchResponse { data, format }.into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

// Special handlers for Avro and CSV

fn handle_avro_s1(data: SmallPayload) -> impl IntoResponse {
    let body = encode_avro(avro_small_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

fn handle_csv_s1(data: SmallPayload) -> impl IntoResponse {
    let mut wtr = csv::Writer::from_writer(Vec::new());
    #[derive(Serialize)]
    struct FlatSmallPayload {
        id: i32,
        name: String,
        value: f32,
        active: bool,
        description: String,
        timestamp: i64,
    }
    wtr.serialize(FlatSmallPayload {
        id: data.id,
        name: data.name,
        value: data.value,
        active: data.active,
        description: data.description,
        timestamp: data.timestamp,
    })
    .unwrap();
    let body = wtr.into_inner().unwrap();
    ([(header::CONTENT_TYPE, "text/csv")], body)
}

fn handle_avro_collection(data: CollectionPayload) -> impl IntoResponse {
    let body = encode_avro(avro_collection_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

fn handle_csv_collection(data: CollectionPayload) -> impl IntoResponse {
    let mut wtr = csv::Writer::from_writer(Vec::new());
    for item in data.items {
        #[derive(Serialize)]
        struct FlatItem {
            id: i32,
            code: String,
            price: f64,
            quantity: i32,
            category: String,
            manufacturer: String,
            weight: String,
        }
        let details = item.details.unwrap_or(ItemDetails {
            manufacturer: String::new(),
            weight: String::new(),
        });
        wtr.serialize(FlatItem {
            id: item.id,
            code: item.code,
            price: item.price,
            quantity: item.quantity,
            category: item.category,
            manufacturer: details.manufacturer,
            weight: details.weight,
        })
        .unwrap();
    }
    let body = wtr.into_inner().unwrap();
    ([(header::CONTENT_TYPE, "text/csv")], body)
}

fn handle_avro_array(data: ArrayPayload) -> impl IntoResponse {
    let body = encode_avro(avro_array_schema(), data).unwrap();
    ([(header::CONTENT_TYPE, "application/avro")], body)
}

fn handle_csv_array(data: ArrayPayload) -> impl IntoResponse {
    let mut wtr = csv::Writer::from_writer(Vec::new());
    for val in data.data {
        wtr.serialize((val,)).unwrap();
    }
    let body = wtr.into_inner().unwrap();
    ([(header::CONTENT_TYPE, "text/csv")], body)
}

// S8: Deserialization test
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
            "s2" | "s3" => {
                let value: CollectionPayload = match serde_json::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s5" => {
                let value: ArrayPayload = match serde_json::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.data.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s4" => {
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
            "s2" | "s3" => {
                let value: CollectionPayload = match rmp_serde::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s5" => {
                let value: ArrayPayload = match rmp_serde::from_slice(&body) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.data.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s4" => {
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
            "s2" | "s3" => {
                let value = match CollectionPayload::decode(body.as_ref()) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.items.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s5" => {
                let value = match ArrayPayload::decode(body.as_ref()) {
                    Ok(value) => value,
                    Err(_) => return StatusCode::BAD_REQUEST.into_response(),
                };
                if validate && value.data.is_empty() {
                    return StatusCode::BAD_REQUEST.into_response();
                }
            }
            "s4" => {
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
            if !matches!(scenario.as_str(), "s1" | "s2" | "s3" | "s5") {
                return StatusCode::NOT_IMPLEMENTED.into_response();
            }
            let schema = match scenario.as_str() {
                "s1" => avro_small_schema(),
                "s2" | "s3" => avro_collection_schema(),
                "s5" => avro_array_schema(),
                _ => unreachable!(),
            };
            let mut input = body.as_ref();
            if apache_avro::from_avro_datum(schema, &mut input, None).is_err() {
                return StatusCode::BAD_REQUEST.into_response();
            }
        }
        "csv" => {
            if !matches!(scenario.as_str(), "s1" | "s2" | "s3" | "s5") {
                return StatusCode::NOT_IMPLEMENTED.into_response();
            }
            let mut rdr = csv::Reader::from_reader(body.as_ref());
            let rows: Vec<_> = match rdr.records().collect::<Result<Vec<_>, _>>() {
                Ok(rows) => rows,
                Err(_) => return StatusCode::BAD_REQUEST.into_response(),
            };
            if validate && rows.is_empty() {
                return StatusCode::BAD_REQUEST.into_response();
            }
        }
        _ => return StatusCode::NOT_IMPLEMENTED.into_response(),
    }
    StatusCode::OK.into_response()
}

#[cfg(test)]
mod tests {
    use super::handle_deserialization_test;
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
}
