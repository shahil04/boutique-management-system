import { connection, NextResponse } from "next/server";
import { listCustomers } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const customers = await listCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return NextResponse.json(
      { error: "Failed to load customers" },
      { status: 500 }
    );
  }
}
