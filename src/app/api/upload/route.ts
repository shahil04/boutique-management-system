import { NextRequest, NextResponse } from "next/server";
import { saveUploadedBuffer } from "@/lib/uploads";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const prefix = String(formData.get("prefix") ?? "slip");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "File exceeds 12 MB limit" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await saveUploadedBuffer(
        buffer,
        file.type || "image/jpeg",
        prefix
      );
      return NextResponse.json({ url: saved.url, filename: saved.filename });
    }

    const body = (await request.json()) as {
      dataUrl?: string;
      prefix?: string;
    };
    const dataUrl = body.dataUrl ?? "";
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return NextResponse.json(
        { error: "Expected multipart file or base64 image dataUrl" },
        { status: 400 }
      );
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image exceeds 12 MB limit" },
        { status: 400 }
      );
    }
    const saved = await saveUploadedBuffer(
      buffer,
      mimeType,
      body.prefix ?? "sketch"
    );
    return NextResponse.json({ url: saved.url, filename: saved.filename });
  } catch (error) {
    console.error("POST /api/upload failed:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
