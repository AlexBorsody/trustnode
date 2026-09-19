import { NextResponse } from "next/server";
import { verifyClaim } from "@/trustnode/pipeline";

export const dynamic = "force-dynamic";

// The commons belongs to everyone (Charter Art. II): the verification API
// is openly callable cross-origin. No credentials are involved.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let body: { claim?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "expected JSON body { claim }" }, 400);
  }
  const claim = (body.claim ?? "").trim();
  if (!claim) {
    return json({ error: "claim is required" }, 400);
  }
  if (claim.length > 500) {
    return json({ error: "claim too long (max 500 chars)" }, 400);
  }
  return json(verifyClaim(claim));
}
