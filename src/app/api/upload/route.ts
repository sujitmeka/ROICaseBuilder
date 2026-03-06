import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { checkAuth } from "../_auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([".pdf", ".docx"]);

type FileType = "pdf" | "docx";

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot).toLowerCase();
}

function classifyFileType(extension: string): FileType | null {
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  return null;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request. Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing required field: file" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "Uploaded file is empty." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds maximum size of 10 MB." },
      { status: 413 },
    );
  }

  const extension = getFileExtension(file.name);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: "Unsupported file type. Only .pdf and .docx files are accepted." },
      { status: 415 },
    );
  }

  const fileType = classifyFileType(extension);

  if (!fileType) {
    return NextResponse.json(
      { error: "Could not determine file type." },
      { status: 400 },
    );
  }

  let text: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (fileType === "pdf") {
      text = await extractPdfText(buffer);
    } else {
      text = await extractDocxText(buffer);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Failed to extract text from ${file.name}:`, message);
    return NextResponse.json(
      { error: `Failed to extract text from file. ${message}` },
      { status: 422 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      { error: "No text content could be extracted from the file." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    text: text.trim(),
    fileName: file.name,
    fileType,
  });
}
