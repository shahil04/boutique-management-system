import { connection, NextRequest, NextResponse } from "next/server";
import { getCustomerById, updateCustomer } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  await connection();
  try {
    const customer = await getCustomerById(numId);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json({ customer });
  } catch (error) {
    console.error("GET /api/customers/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to load customer" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return NextResponse.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      customer_name?: string;
      phone?: string;
      address?: string;
      notes?: string;
    };
    const updated = await updateCustomer(numId, body);
    if (!updated) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ customer: updated });
  } catch (error) {
    console.error("PATCH /api/customers/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to update customer" },
      { status: 500 }
    );
  }
}
