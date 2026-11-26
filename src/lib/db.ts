import type {
  BoutiqueOrder,
  CustomerSummary,
  OrderInput,
  ShopSettings,
} from "./types";

async function getDatabase() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.SUPABASE_DB_URL?.trim()) {
      throw new Error(
        "SUPABASE_DB_URL is required in production. Configure the Supabase transaction-pooler connection string in Vercel."
      );
    }
    return import("./db-supabase");
  }

  if (process.env.SUPABASE_DB_URL?.trim()) {
    return import("./db-supabase");
  }

  return import("./db-sqlite");
}

export async function listOrders(filters?: {
  q?: string;
  status?: string;
  due?: string;
}): Promise<BoutiqueOrder[]> {
  return (await getDatabase()).listOrders(filters);
}

export async function getOrderById(id: number): Promise<BoutiqueOrder | null> {
  return (await getDatabase()).getOrderById(id);
}

export async function getNextSerialNo(): Promise<string> {
  return (await getDatabase()).getNextSerialNo();
}

export async function createOrder(input: OrderInput): Promise<BoutiqueOrder> {
  return (await getDatabase()).createOrder(input);
}

export async function updateOrder(
  id: number,
  patch: Partial<OrderInput>
): Promise<BoutiqueOrder | null> {
  return (await getDatabase()).updateOrder(id, patch);
}

export async function deleteOrder(id: number): Promise<boolean> {
  return (await getDatabase()).deleteOrder(id);
}

export async function listCustomers(): Promise<CustomerSummary[]> {
  return (await getDatabase()).listCustomers();
}

export async function getCustomerById(
  id: number
): Promise<CustomerSummary | null> {
  return (await getDatabase()).getCustomerById(id);
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
  return (await getDatabase()).updateCustomer(id, patch);
}

export async function getSettings(): Promise<ShopSettings> {
  return (await getDatabase()).getSettings();
}

export async function updateSettings(
  patch: Partial<ShopSettings>
): Promise<ShopSettings> {
  return (await getDatabase()).updateSettings(patch);
}
