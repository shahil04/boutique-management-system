import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const EXTENSION_MIMES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

type S3Configuration = {
  bucket: string;
  region: string;
};

type UploadedFile = { buffer: Buffer; mimeType: string };

let s3Client: S3Client | null = null;

function getS3Configuration(): S3Configuration {
  const config: S3Configuration = {
    bucket: process.env.S3_BUCKET?.trim() ?? "",
    region: process.env.AWS_REGION?.trim() ?? "",
  };
  const missing = [
    !config.bucket && "S3_BUCKET",
    !config.region && "AWS_REGION",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Configure required S3 settings: ${missing.join(", ")}.`);
  }
  return config;
}

function getS3(): { client: S3Client; config: S3Configuration } {
  const config = getS3Configuration();

  if (!s3Client) {
    s3Client = new S3Client({ region: config.region });
  }

  return { client: s3Client, config };
}

export async function saveUploadedBuffer(
  buffer: Buffer,
  mimeType: string,
  prefix = "slip"
): Promise<{ filename: string; url: string }> {
  const safePrefix =
    prefix.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "file";
  const ext = MIME_EXTENSIONS[mimeType.toLowerCase()] ?? ".png";
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const { client, config } = getS3();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: filename,
      Body: buffer,
      ContentType: mimeType || "image/jpeg",
    })
  );

  return { filename, url: `/api/files/${filename}` };
}

export async function getUploadedFile(
  segments: string[]
): Promise<UploadedFile | null> {
  if (
    segments.length !== 1 ||
    !/^[a-zA-Z0-9._-]+$/.test(segments[0])
  ) {
    return null;
  }

  const { client, config } = getS3();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: segments[0],
      })
    );
    if (!response.Body) {
      throw new Error("S3 returned an empty image response.");
    }

    return {
      buffer: Buffer.from(await response.Body.transformToByteArray()),
      mimeType:
        response.ContentType ||
        EXTENSION_MIMES[
          segments[0].slice(segments[0].lastIndexOf(".")).toLowerCase()
        ] ||
        "application/octet-stream",
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      ("name" in error && error.name === "NoSuchKey" ||
        "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404)
    ) {
      return null;
    }
    throw error;
  }
}

export async function readUploadAsBase64(url: string): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  if (!url.startsWith("/api/files/")) return null;
  const filename = url.slice("/api/files/".length);

  const uploaded = await getUploadedFile([filename]);
  if (!uploaded) return null;
  return {
    base64: uploaded.buffer.toString("base64"),
    mimeType: uploaded.mimeType,
  };
}
