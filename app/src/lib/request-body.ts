export async function boundedBody(req: Request, limit: number): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > limit) throw new Error("Request body is too large.");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Request body is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function boundedJson(req: Request, limit = 32_768): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await boundedBody(req, limit)));
}
