import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_ANON_KEY ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!url.startsWith("http") || !key) return NextResponse.json({ providers: [] }, { headers });
  try {
    // Public Auth settings, never the management API or a service-role client.
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: key }, signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Unavailable");
    const settings = await response.json();
    const providers = ["google", "azure"].filter(provider => settings.external?.[provider] === true);
    return NextResponse.json({ providers, signupEnabled: settings.disable_signup === false }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not check sign-in availability. Try again." }, { status: 503, headers });
  }
}
