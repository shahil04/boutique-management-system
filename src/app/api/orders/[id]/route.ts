import { connection, NextRequest, NextResponse } from "next/server";
import { deleteOrder, getOrderById, updateOrder } from "@/lib/db";
import { OrderInput } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  await connection();
  try {
    const order = await getOrderById(numId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    console.error("GET /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to load order" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<OrderInput>;
    const updated = await updateOrder(numId, body);
    if (!updated) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("PATCH /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  try {
    const deleted = await deleteOrder(numId);
    if (!deleted) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/orders/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete order" },
      { status: 500 }
    );
  }
}
