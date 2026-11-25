import { NextResponse } from "next/server";
import { listCustomers } from "@/lib/db";

export async function GET() {
  try {
    const customers = listCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return NextResponse.json(
      { error: "Failed to load customers" },
      { status: 500 }
    );
  }
}
