import { connection, NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/db";
import { ShopSettings } from "@/lib/types";

export async function GET() {
  await connection();
  try {
    const settings = await getSettings();
    const hasEnvGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    return NextResponse.json({ settings, hasEnvGeminiKey });
  } catch (error) {
    console.error("GET /api/settings failed:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ShopSettings>;
    const settings = await updateSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("PATCH /api/settings failed:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
