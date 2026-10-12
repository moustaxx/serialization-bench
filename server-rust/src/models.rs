use prost::Message;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

// S1: Mały payload (1 obiekt, 5–10 pól)
#[derive(Clone, Serialize, Deserialize, Message)]
pub struct SmallPayload {
    #[prost(int32, tag = "1")]
    pub id: i32,
    #[prost(string, tag = "2")]
    pub name: String,
    #[prost(float, tag = "3")]
    pub value: f32,
    #[prost(bool, tag = "4")]
    pub active: bool,
    #[prost(string, tag = "5")]
    pub description: String,
    #[prost(int64, tag = "6")]
    pub timestamp: i64,
}

// S2 & S3: Średni i Duży payload
#[derive(Clone, Serialize, Deserialize, Message)]
pub struct Item {
    #[prost(int32, tag = "1")]
    pub id: i32,
    #[prost(string, tag = "2")]
    pub code: String,
    #[prost(double, tag = "3")]
    pub price: f64,
    #[prost(int32, tag = "4")]
    pub quantity: i32,
    #[prost(string, tag = "5")]
    pub category: String,
    #[prost(message, optional, tag = "6")]
    pub details: Option<ItemDetails>,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct ItemDetails {
    #[prost(string, tag = "1")]
    pub manufacturer: String,
    #[prost(string, tag = "2")]
    pub weight: String,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct CollectionPayload {
    #[prost(message, repeated, tag = "1")]
    pub items: Vec<Item>,
}

// S4: Głębokie zagnieżdżenie (5–7 poziomów)
#[derive(Clone, Serialize, Deserialize, Message)]
pub struct NestedLevel1 {
    #[prost(message, optional, tag = "1")]
    pub next: Option<Box<NestedLevel2>>,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct NestedLevel2 {
    #[prost(message, optional, tag = "1")]
    pub next: Option<Box<NestedLevel3>>,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct NestedLevel3 {
    #[prost(message, optional, tag = "1")]
    pub next: Option<Box<NestedLevel4>>,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct NestedLevel4 {
    #[prost(message, optional, tag = "1")]
    pub next: Option<Box<NestedLevel5>>,
}

#[derive(Clone, Serialize, Deserialize, Message)]
pub struct NestedLevel5 {
    #[prost(string, tag = "1")]
    pub leaf: String,
}

// S5: Dane jednorodne (tablice)
#[derive(Clone, Serialize, Deserialize, Message)]
pub struct ArrayPayload {
    #[prost(int32, repeated, tag = "1")]
    pub data: Vec<i32>,
}

pub struct PreparedPayloads {
    pub s1: SmallPayload,
    pub s2: CollectionPayload,
    pub s3: CollectionPayload,
    pub s4: NestedLevel1,
    pub s5: ArrayPayload,
}

static PREPARED_PAYLOADS: OnceLock<PreparedPayloads> = OnceLock::new();

pub fn prepare_payloads() {
    let _ = PREPARED_PAYLOADS.set(PreparedPayloads {
        s1: gen_s1(),
        s2: gen_s2(),
        s3: gen_s3(),
        s4: gen_s4(),
        s5: gen_s5(),
    });
}

pub fn prepared_payloads() -> &'static PreparedPayloads {
    PREPARED_PAYLOADS
        .get()
        .expect("benchmark payloads must be prepared before serving")
}

// Funkcje pomocnicze do generowania danych
pub fn gen_s1() -> SmallPayload {
    SmallPayload {
        id: 1,
        name: "Test Object".to_string(),
        value: 123.45,
        active: true,
        description: "To jest mały payload testowy".to_string(),
        timestamp: 1714065600,
    }
}

pub fn gen_s2() -> CollectionPayload {
    let items = (0..100)
        .map(|i| Item {
            id: i,
            code: format!("CODE-{:04}", i),
            price: i as f64 * 1.5,
            quantity: i * 2,
            category: "Electronics".to_string(),
            details: Some(ItemDetails {
                manufacturer: "RustCorp".to_string(),
                weight: "1.2kg".to_string(),
            }),
        })
        .collect();
    CollectionPayload { items }
}

pub fn gen_s3() -> CollectionPayload {
    let items = (0..10000)
        .map(|i| Item {
            id: i,
            code: format!("CODE-{:04}", i),
            price: i as f64 * 1.5,
            quantity: i * 2,
            category: "Industrial".to_string(),
            details: Some(ItemDetails {
                manufacturer: "MegaFactory".to_string(),
                weight: "50kg".to_string(),
            }),
        })
        .collect();
    CollectionPayload { items }
}

pub fn gen_s4() -> NestedLevel1 {
    NestedLevel1 {
        next: Some(Box::new(NestedLevel2 {
            next: Some(Box::new(NestedLevel3 {
                next: Some(Box::new(NestedLevel4 {
                    next: Some(Box::new(NestedLevel5 {
                        leaf: "Deep value".to_string(),
                    })),
                })),
            })),
        })),
    }
}

pub fn gen_s5() -> ArrayPayload {
    ArrayPayload {
        data: (0..100000).collect(),
    }
}
