import { NextRequest, NextResponse } from "next/server";
import {
  createOrder,
  getNextSerialNo,
  listOrders,
} from "@/lib/db";
import { OrderInput } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const due = searchParams.get("due") ?? undefined;

    const orders = listOrders({ q, status, due });
    const nextSerialNo = getNextSerialNo();
    return NextResponse.json({ orders, nextSerialNo });
  } catch (error) {
    console.error("GET /api/orders failed:", error);
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<OrderInput>;
    if (!body.serial_no?.trim() || !body.customer_name?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { error: "Serial No., Customer Name, and Phone Number are required." },
        { status: 400 }
      );
    }
    if (!body.order_date || !body.delivery_date) {
      return NextResponse.json(
        { error: "Order Date and Delivery Date are required." },
        { status: 400 }
      );
    }

    const created = createOrder(body as OrderInput);
    return NextResponse.json({ order: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
