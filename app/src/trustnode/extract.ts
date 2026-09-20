/**
 * Deterministic file-content extraction for uploads (DESIGN §18, BUG-002).
 *
 * Pure functions of (bytes, mime): same bytes -> same text, byte-identical.
 * No network, no model, no magic-byte sniffing here — the MIME allowlist is
 * checked by the caller (the upload route); hardening (magic-byte validation)
 * is explicitly deferred to the post-Phase-1 backlog.
 *
 * Supported: pdf (pinned pdf-parse), txt/md (UTF-8), html (tag-stripping,
 * same rules as the link-meta path), csv (row text), json (string values).
 * Extracted text is capped at 200KB. Failures throw — the caller maps them
 * to status='failed' with the reason.
 */

export const MAX_EXTRACTED_CHARS = 200 * 1024; // 200KB cap (DESIGN §18)

/** Strip tags the same way the link-meta path does: scripts/styles dropped,
 *  tags replaced by spaces, whitespace collapsed. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** CSV -> row text: one trimmed non-empty line per row. */
export function csvToText(csv: string): string {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** JSON -> every string value in the document, document order, one per line. */
export function jsonToText(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON: parse failed");
  }
  const strings: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      if (v.trim()) strings.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === "object") {
      for (const value of Object.values(v)) walk(value);
    }
  };
  walk(parsed);
  return strings.join("\n");
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  // pdf-parse's package index runs debug code on import (it reads a test PDF
  // when module.parent is unset), so import the parser lib directly.
  // pdf-parse is CommonJS; dynamic import keeps it out of the client bundle.
  const mod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
    default?: (data: Uint8Array) => Promise<{ text?: string }>;
  } & ((data: Uint8Array) => Promise<{ text?: string }>);
  const parse = mod.default ?? mod;
  if (typeof parse !== "function") throw new Error("PDF parser unavailable");
  // Pass a fresh Uint8Array: the bundled pdf.js (v1.10) misreads Node Buffers
  // (it ignores the Buffer's byteOffset into the shared pool), so never hand
  // it a Buffer. .slice() copies into a zero-offset ArrayBuffer.
  const data = await parse(bytes.slice());
  return (data.text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Extract searchable text from uploaded bytes. Throws on failure —
 * the caller records status='failed' with the thrown message.
 */
export async function extractText(bytes: Uint8Array, mime: string): Promise<string> {
  let text: string;
  switch (mime) {
    case "application/pdf":
      text = await pdfToText(bytes);
      break;
    case "text/plain":
    case "text/markdown":
      text = new TextDecoder().decode(bytes);
      break;
    case "text/html":
      text = stripHtml(new TextDecoder().decode(bytes));
      break;
    case "text/csv":
      text = csvToText(new TextDecoder().decode(bytes));
      break;
    case "application/json":
      text = jsonToText(new TextDecoder().decode(bytes));
      break;
    default:
      throw new Error(`unsupported MIME for extraction: ${mime}`);
  }
  return text.slice(0, MAX_EXTRACTED_CHARS);
}
