import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  BoutiqueOrder,
  CustomerSummary,
  EMPTY_MEASUREMENTS,
  Measurements,
  OrderInput,
  ShopSettings,
  normalizePhoneKey,
} from "./types";

type DynamoTables = {
  orders: string;
  customers: string;
  settings: string;
};

type StoredCustomer = {
  id: number;
  name: string;
  phone: string;
  phone_key: string;
  address: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type StoredSetting = { key: string; value: string | number };

let dynamoClient: DynamoDBDocumentClient | null = null;

function getTables(): DynamoTables {
  const tables = {
    orders: process.env.DYNAMODB_ORDERS_TABLE?.trim() ?? "",
    customers: process.env.DYNAMODB_CUSTOMERS_TABLE?.trim() ?? "",
    settings: process.env.DYNAMODB_SETTINGS_TABLE?.trim() ?? "",
  };
  const missing = Object.entries(tables)
    .filter(([, name]) => !name)
    .map(([key]) => `DYNAMODB_${key.toUpperCase()}_TABLE`);

  if (!process.env.AWS_REGION?.trim()) missing.push("AWS_REGION");
  if (missing.length) {
    throw new Error(`Configure required AWS settings: ${missing.join(", ")}.`);
  }
  return tables;
}

function getDynamoClient(): DynamoDBDocumentClient {
  if (!dynamoClient) {
    const region = process.env.AWS_REGION?.trim();
    if (!region) {
      throw new Error("AWS_REGION is required to connect to DynamoDB.");
    }
    dynamoClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
  }
  return dynamoClient;
}

async function scanAll<T>(tableName: string): Promise<T[]> {
  const client = getDynamoClient();
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...((response.Items ?? []) as T[]));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

async function allocateId(counter: "orders" | "customers"): Promise<number> {
  const { settings } = getTables();
  const response = await getDynamoClient().send(
    new UpdateCommand({
      TableName: settings,
      Key: { key: `counter#${counter}` },
      UpdateExpression: "ADD #value :increment",
      ExpressionAttributeNames: { "#value": "value" },
      ExpressionAttributeValues: { ":increment": 1 },
      ReturnValues: "UPDATED_NEW",
    })
  );
  const id = Number(response.Attributes?.value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`DynamoDB did not return a valid ${counter} ID.`);
  }
  return id;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function resolveOrCreateCustomer(input: {
  customer_id?: number | null;
  customer_name: string;
  phone: string;
  address?: string;
}): Promise<number> {
  const { customers } = getTables();
  const client = getDynamoClient();
  const cleanName = input.customer_name.trim();
  const cleanPhone = input.phone.trim();
  const phoneKey = normalizePhoneKey(cleanPhone);
  const cleanAddress = (input.address ?? "").trim();
  let existing: StoredCustomer | undefined;

  if (input.customer_id && Number.isInteger(input.customer_id)) {
    const response = await client.send(
      new GetCommand({
        TableName: customers,
        Key: { id: input.customer_id },
      })
    );
    existing = response.Item as StoredCustomer | undefined;
  }

  if (!existing) {
    const records = await scanAll<StoredCustomer>(customers);
    existing = records.find((customer) =>
      phoneKey
        ? customer.phone_key === phoneKey
        : cleanName &&
          customer.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
  }

  if (existing) {
    if (cleanAddress && !existing.address) {
      await client.send(
        new UpdateCommand({
          TableName: customers,
          Key: { id: existing.id },
          UpdateExpression: "SET #address = :address, updated_at = :updated_at",
          ExpressionAttributeNames: { "#address": "address" },
          ExpressionAttributeValues: {
            ":address": cleanAddress,
            ":updated_at": new Date().toISOString(),
          },
        })
      );
    }
    return existing.id;
  }

  const now = new Date().toISOString();
  const customer: StoredCustomer = {
    id: await allocateId("customers"),
    name: cleanName,
    phone: cleanPhone,
    phone_key: phoneKey,
    address: cleanAddress,
    notes: "",
    created_at: now,
    updated_at: now,
  };
  await client.send(
    new PutCommand({
      TableName: customers,
      Item: customer,
      ConditionExpression: "attribute_not_exists(id)",
    })
  );
  return customer.id;
}

export async function listOrders(filters?: {
  q?: string;
  status?: string;
  due?: string;
}): Promise<BoutiqueOrder[]> {
  const { orders: table } = getTables();
  let orders = (await scanAll<BoutiqueOrder>(table)).sort(
    (a, b) => b.id - a.id
  );
  const query = filters?.q?.trim().toLowerCase();
  if (query) {
    orders = orders.filter(
      (order) =>
        order.serial_no.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.phone.toLowerCase().includes(query) ||
        order.garment_type.toLowerCase().includes(query)
    );
  }
  if (filters?.status && filters.status !== "All") {
    orders = orders.filter((order) => order.status === filters.status);
  }
  if (filters?.due) {
    const today = getTodayIso();
    if (filters.due === "today") {
      orders = orders.filter(
        (order) =>
          order.delivery_date === today && order.status !== "Delivered"
      );
    } else if (filters.due === "overdue") {
      orders = orders.filter(
        (order) =>
          order.delivery_date < today && order.status !== "Delivered"
      );
    } else if (filters.due === "upcoming") {
      const limit = addDaysIso(today, 3);
      orders = orders.filter(
        (order) =>
          order.delivery_date >= today &&
          order.delivery_date <= limit &&
          order.status !== "Delivered"
      );
    }
  }
  return orders;
}

export async function getOrderById(id: number): Promise<BoutiqueOrder | null> {
  const { orders } = getTables();
  const response = await getDynamoClient().send(
    new GetCommand({ TableName: orders, Key: { id } })
  );
  return (response.Item as BoutiqueOrder | undefined) ?? null;
}

export async function getNextSerialNo(): Promise<string> {
  const { orders } = getTables();
  const records = await scanAll<Pick<BoutiqueOrder, "serial_no">>(orders);
  let maxNum = 678;
  for (const record of records) {
    const num = parseInt(record.serial_no.replace(/\D/g, ""), 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }
  return String(maxNum + 1);
}

export async function createOrder(input: OrderInput): Promise<BoutiqueOrder> {
  const { orders } = getTables();
  const now = new Date().toISOString();
  const items = Array.isArray(input.items) ? input.items : [];
  const itemsTotal = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const totalAmount =
    input.total_amount !== undefined && input.total_amount !== null
      ? Number(input.total_amount) || 0
      : itemsTotal;
  const advancePaid = Number(input.advance_paid ?? 0) || 0;
  const balanceDue =
    input.balance_due !== undefined && input.balance_due !== null
      ? Number(input.balance_due)
      : Math.max(0, totalAmount - advancePaid);
  const measurements: Measurements = {
    ...EMPTY_MEASUREMENTS,
    ...(input.measurements ?? {}),
  };
  const customerId = await resolveOrCreateCustomer(input);
  const order: BoutiqueOrder = {
    id: await allocateId("orders"),
    customer_id: customerId,
    serial_no: input.serial_no.trim(),
    customer_name: input.customer_name.trim(),
    phone: input.phone.trim(),
    address: (input.address ?? "").trim(),
    garment_type: (input.garment_type ?? "").trim(),
    order_date: input.order_date,
    delivery_date: input.delivery_date,
    status: input.status ?? "Received",
    measurements,
    items,
    total_amount: totalAmount,
    advance_paid: advancePaid,
    balance_due: balanceDue,
    slip_photo_url: input.slip_photo_url ?? "",
    design_photos: input.design_photos ?? [],
    ocr_raw_json: input.ocr_raw_json ?? "",
    ocr_confidence: input.ocr_confidence ?? "none",
    verified_by: (input.verified_by ?? "").trim(),
    created_at: now,
    updated_at: now,
  };
  await getDynamoClient().send(
    new PutCommand({
      TableName: orders,
      Item: order,
      ConditionExpression: "attribute_not_exists(id)",
    })
  );
  return order;
}

export async function updateOrder(
  id: number,
  patch: Partial<OrderInput>
): Promise<BoutiqueOrder | null> {
  const existing = await getOrderById(id);
  if (!existing) return null;
  const items = patch.items !== undefined ? patch.items : existing.items;
  const totalAmount =
    patch.total_amount !== undefined
      ? Number(patch.total_amount) || 0
      : existing.total_amount;
  const advancePaid =
    patch.advance_paid !== undefined
      ? Number(patch.advance_paid) || 0
      : existing.advance_paid;
  const measurements: Measurements = {
    ...existing.measurements,
    ...(patch.measurements ?? {}),
  };
  const order: BoutiqueOrder = {
    ...existing,
    serial_no: (patch.serial_no ?? existing.serial_no).trim(),
    customer_name: (patch.customer_name ?? existing.customer_name).trim(),
    phone: (patch.phone ?? existing.phone).trim(),
    address: (patch.address ?? existing.address).trim(),
    garment_type: (patch.garment_type ?? existing.garment_type).trim(),
    order_date: patch.order_date ?? existing.order_date,
    delivery_date: patch.delivery_date ?? existing.delivery_date,
    status: patch.status ?? existing.status,
    measurements,
    items,
    total_amount: totalAmount,
    advance_paid: advancePaid,
    balance_due:
      patch.balance_due !== undefined
        ? Number(patch.balance_due)
        : Math.max(0, totalAmount - advancePaid),
    slip_photo_url:
      patch.slip_photo_url !== undefined
        ? patch.slip_photo_url
        : existing.slip_photo_url,
    design_photos:
      patch.design_photos !== undefined
        ? patch.design_photos
        : existing.design_photos,
    ocr_raw_json:
      patch.ocr_raw_json !== undefined
        ? patch.ocr_raw_json
        : existing.ocr_raw_json,
    ocr_confidence: patch.ocr_confidence ?? existing.ocr_confidence,
    verified_by: (patch.verified_by ?? existing.verified_by).trim(),
    updated_at: new Date().toISOString(),
  };
  const { orders: table } = getTables();
  await getDynamoClient().send(
    new PutCommand({ TableName: table, Item: order })
  );
  return order;
}

export async function deleteOrder(id: number): Promise<boolean> {
  const { orders } = getTables();
  const response = await getDynamoClient().send(
    new DeleteCommand({
      TableName: orders,
      Key: { id },
      ReturnValues: "ALL_OLD",
    })
  );
  return Boolean(response.Attributes);
}

export async function listCustomers(): Promise<CustomerSummary[]> {
  const { customers } = getTables();
  const [customerRecords, orders] = await Promise.all([
    scanAll<StoredCustomer>(customers),
    listOrders(),
  ]);
  const ordersByCustomer = new Map<number, BoutiqueOrder[]>();
  for (const order of orders) {
    if (order.customer_id !== null) {
      const customerOrders = ordersByCustomer.get(order.customer_id) ?? [];
      customerOrders.push(order);
      ordersByCustomer.set(order.customer_id, customerOrders);
    }
  }

  const summaries = customerRecords.map((record): CustomerSummary => {
    const customerOrders = ordersByCustomer.get(record.id) ?? [];
    let totalSpent = 0;
    let pendingBalance = 0;
    let lastOrderDate = "";
    let latestMeasurements = { ...EMPTY_MEASUREMENTS };
    let latestSerialNo = "";
    for (const order of customerOrders) {
      totalSpent += order.total_amount;
      if (order.status !== "Delivered") pendingBalance += order.balance_due;
      if (!lastOrderDate || order.order_date > lastOrderDate) {
        lastOrderDate = order.order_date;
        latestMeasurements = order.measurements;
        latestSerialNo = order.serial_no;
      }
    }
    const name = record.name ?? "";
    const phone = record.phone ?? "";
    return {
      id: record.id,
      key: normalizePhoneKey(phone) || name.trim().toLowerCase() || String(record.id),
      customer_name: name,
      phone,
      address: record.address ?? "",
      notes: record.notes ?? "",
      order_count: customerOrders.length,
      total_spent: totalSpent,
      pending_balance: pendingBalance,
      last_order_date:
        lastOrderDate || String(record.created_at ?? "").slice(0, 10),
      latest_measurements: latestMeasurements,
      latest_serial_no: latestSerialNo,
      orders: customerOrders,
    };
  });
  return summaries.sort((a, b) =>
    b.last_order_date.localeCompare(a.last_order_date)
  );
}

export async function getCustomerById(
  id: number
): Promise<CustomerSummary | null> {
  return (await listCustomers()).find((customer) => customer.id === id) ?? null;
}

export async function updateCustomer(
  id: number,
  patch: {
    customer_name?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }
): Promise<CustomerSummary | null> {
  const existing = await getCustomerById(id);
  if (!existing) return null;
  const { customers, orders } = getTables();
  const client = getDynamoClient();
  const customerResponse = await client.send(
    new GetCommand({ TableName: customers, Key: { id } })
  );
  const record = customerResponse.Item as StoredCustomer | undefined;
  if (!record) return null;

  const nextName = (patch.customer_name ?? existing.customer_name).trim();
  const nextPhone = (patch.phone ?? existing.phone).trim();
  const nextAddress = (patch.address ?? existing.address).trim();
  const nextNotes = (patch.notes ?? existing.notes).trim();
  const now = new Date().toISOString();
  await client.send(
    new PutCommand({
      TableName: customers,
      Item: {
        ...record,
        name: nextName,
        phone: nextPhone,
        phone_key: normalizePhoneKey(nextPhone),
        address: nextAddress,
        notes: nextNotes,
        updated_at: now,
      } satisfies StoredCustomer,
    })
  );

  const linkedOrders = (await scanAll<BoutiqueOrder>(orders)).filter(
    (order) => order.customer_id === id
  );
  for (const order of linkedOrders) {
    await client.send(
      new PutCommand({
        TableName: orders,
        Item: {
          ...order,
          customer_name: nextName,
          phone: nextPhone,
          address: nextAddress,
          updated_at: now,
        } satisfies BoutiqueOrder,
      })
    );
  }
  return getCustomerById(id);
}

const DEFAULT_SETTINGS: ShopSettings = {
  shop_name: "Noor & Co. Boutique",
  shop_phone: "",
  shop_address: "",
  default_unit: "inches",
};

export async function getSettings(): Promise<ShopSettings> {
  const { settings } = getTables();
  const records = await scanAll<StoredSetting>(settings);
  const values = new Map(
    records.map((record) => [record.key, String(record.value)])
  );
  return {
    shop_name: values.get("shop_name") ?? DEFAULT_SETTINGS.shop_name,
    shop_phone: values.get("shop_phone") ?? DEFAULT_SETTINGS.shop_phone,
    shop_address: values.get("shop_address") ?? DEFAULT_SETTINGS.shop_address,
    default_unit: values.get("default_unit") ?? DEFAULT_SETTINGS.default_unit,
  };
}

export async function updateSettings(
  patch: Partial<ShopSettings>
): Promise<ShopSettings> {
  const { settings } = getTables();
  const allowed: (keyof ShopSettings)[] = [
    "shop_name",
    "shop_phone",
    "shop_address",
    "default_unit",
  ];
  const client = getDynamoClient();
  await Promise.all(
    allowed
      .filter((key) => patch[key] !== undefined)
      .map((key) =>
        client.send(
          new PutCommand({
            TableName: settings,
            Item: { key, value: String(patch[key]).trim() },
          })
        )
      )
  );
  return getSettings();
}
