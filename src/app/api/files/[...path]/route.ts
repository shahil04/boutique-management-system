import { connection, NextRequest, NextResponse } from "next/server";
import { getUploadedFile } from "@/lib/uploads";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await connection();
  try {
    const { path: segments } = await context.params;
    const uploaded = await getUploadedFile(segments);
    if (!uploaded) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(uploaded.buffer), {
      status: 200,
      headers: {
        "Content-Type": uploaded.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("GET /api/files/[...path] failed:", error);
    return NextResponse.json(
      { error: "Failed to load file" },
      { status: 500 }
    );
  }
}
