import { NextResponse } from "next/server";
import { verifyClaim } from "@/trustnode/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { claim?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body { claim }" }, { status: 400 });
  }
  const claim = (body.claim ?? "").trim();
  if (!claim) {
    return NextResponse.json({ error: "claim is required" }, { status: 400 });
  }
  if (claim.length > 500) {
    return NextResponse.json({ error: "claim too long (max 500 chars)" }, { status: 400 });
  }
  return NextResponse.json(verifyClaim(claim));
}
