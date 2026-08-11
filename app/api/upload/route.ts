import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return new Response("Missing BLOB_READ_WRITE_TOKEN. Don't forget to add that to your .env file.", {
      status: 401,
    });
  }

  const file = req.body || "";
  const filename = req.headers.get("x-vercel-filename") || "file.txt";
  const contentType = req.headers.get("content-type") || "application/octet-stream";

  // Determine file extension from content type or filename
  let fileType = "";
  if (filename.includes(".")) {
    fileType = filename.substring(filename.lastIndexOf("."));
  } else {
    const typeMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "application/pdf": ".pdf",
      "video/mp4": ".mp4",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    };
    fileType = typeMap[contentType] || `.${contentType.split("/")[1]}`;
  }

  // Construct final filename based on content-type if not provided
  const finalName = filename.includes(fileType) ? filename : `${filename}${fileType}`;

  // Size validation
  const fileSize = Number(req.headers.get("content-length") || 0);
  const isVideo = contentType.startsWith("video/");
  const maxSize = isVideo ? 100 * 1024 * 1024 : 50 * 1024 * 1024;

  if (fileSize > maxSize) {
    return new Response(`File too large. Max size is ${isVideo ? "100MB" : "50MB"}.`, {
      status: 413,
    });
  }

  const blob = await put(finalName, file, {
    contentType,
    access: "public",
  });

  return NextResponse.json(blob);
}
