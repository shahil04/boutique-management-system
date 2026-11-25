import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { resolveUploadPath } from "@/lib/uploads";

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path: segments } = await context.params;
  const resolved = resolveUploadPath(segments);
  if (!resolved) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(/*turbopackIgnore: true*/ resolved.filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": resolved.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
