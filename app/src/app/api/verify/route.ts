import { NextResponse } from "next/server";
import { verifyClaim, communityTextStance, type SourceSeed } from "@/trustnode/pipeline";
import { publicFileUrl, supabaseConfigured, supabaseFor } from "@/lib/supabase";

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

  // The commons shelf: ready community-contributed sources join retrieval.
  // They carry no earned trust until it is measured — labeled, never merged.
  let extra: SourceSeed[] = [];
  if (supabaseConfigured()) {
    try {
      const sb = supabaseFor();
      const { data } = await sb
        .from("tn_sources")
        .select("id, kind, title, url, file_path, excerpt, extracted_text, created_at")
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(200);
      extra = ((data ?? []) as {
        id: string;
        kind: "file" | "link";
        title: string;
        url: string | null;
        file_path: string | null;
        excerpt: string | null;
        extracted_text: string | null;
        created_at: string;
      }[]).map((r) => {
        // Unreviewed community material: a labeled mechanical keyword stance,
        // zero earned trust, so it surfaces visibly but never moves confidence.
        // Retrieval text = contributor excerpt + extracted file text (DESIGN §18).
        const text = [r.excerpt, r.extracted_text].filter(Boolean).join("\n\n");
        return {
          id: `community:${r.id}`,
          title: r.title,
          url:
            r.kind === "link"
              ? (r.url ?? "")
              : r.file_path
                ? publicFileUrl(r.file_path)
                : "",
          publisher: "Community contribution",
          published: r.created_at.slice(0, 10),
          updated: r.created_at.slice(0, 10),
          superseded_by: null,
          trust: {
            earned: 0,
            earned_rationale:
              "Community-contributed source: no measured track record yet.",
            community: 0,
            community_votes: 0,
          },
          keywords: [],
          text,
          stances: communityTextStance(r.title, text),
        };
      });
    } catch {
      // The commons shelf is best-effort; seeds always verify.
      extra = [];
    }
  }

  return json(verifyClaim(claim, 6, extra));
}
