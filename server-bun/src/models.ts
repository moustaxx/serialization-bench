// S1: Mały payload
export interface SmallPayload {
    id: number;
    name: string;
    value: number;
    active: boolean;
    description: string;
    timestamp: number;
}

// S2 & S3: Średni i Duży payload
export interface ItemDetails {
    manufacturer: string;
    weight: string;
}

export interface Item {
    id: number;
    code: string;
    price: number;
    quantity: number;
    category: string;
    details?: ItemDetails;
}

export interface CollectionPayload {
    items: Item[];
}

// S4: Głębokie zagnieżdżenie (5 poziomów)
export interface NestedLevel5 {
    leaf: string;
}

export interface NestedLevel4 {
    next?: NestedLevel5;
}

export interface NestedLevel3 {
    next?: NestedLevel4;
}

export interface NestedLevel2 {
    next?: NestedLevel3;
}

export interface NestedLevel1 {
    next?: NestedLevel2;
}

// S5: Dane jednorodne (tablice)
export interface ArrayPayload {
    data: number[];
}

// Funkcje pomocnicze do generowania danych
export function genS1(): SmallPayload {
    return {
        id: 1,
        name: "Test Object",
        value: 123.45,
        active: true,
        description: "To jest mały payload testowy",
        timestamp: 1714065600,
    };
}

export function genS2(): CollectionPayload {
    const items: Item[] = [];
    for (let i = 0; i < 100; i++) {
        items.push({
            id: i,
            code: `CODE-${i.toString().padStart(4, "0")}`,
            price: i * 1.5,
            quantity: i * 2,
            category: "Electronics",
            details: {
                manufacturer: "RustCorp",
                weight: "1.2kg",
            },
        });
    }
    return { items };
}

export function genS3(): CollectionPayload {
    const items: Item[] = [];
    for (let i = 0; i < 10000; i++) {
        items.push({
            id: i,
            code: `CODE-${i.toString().padStart(4, "0")}`,
            price: i * 1.5,
            quantity: i * 2,
            category: "Industrial",
            details: {
                manufacturer: "MegaFactory",
                weight: "50kg",
            },
        });
    }
    return { items };
}

export function genS4(): NestedLevel1 {
    return {
        next: {
            next: {
                next: {
                    next: {
                        leaf: "Deep value",
                    },
                },
            },
        },
    };
}

export function genS5(): ArrayPayload {
    const data: number[] = [];
    for (let i = 0; i < 100000; i++) {
        data.push(i);
    }
    return { data };
}
