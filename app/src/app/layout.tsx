import type { Metadata } from "next";
import "./globals.css";
import AccountNav from "@/auth/AccountNav";
import { PIPELINE_VERSION } from "@/trustnode/version";

export const metadata: Metadata = {
  title: "TrustNode — the trust layer between generative AI and reality",
  description:
    "Take an AI-generated claim. Get its sources, supporting evidence, contradictions, and provenance. Deterministic prototype.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-mark">⬡</div>
              <div className="brand-name">
                TRUSTNODE
                <small>THE TRUST LAYER BETWEEN AI AND REALITY</small>
              </div>
            </div>
            <nav className="nav">
              <a href="/">Home</a>
              <a href="/sources">Source shelf</a>
              <a href="/packs">Source packs</a>
              <a href="/templates">Category templates</a>
              <a href="/trust">Trust rankings</a>
              <a href="/explore">Explore sources</a>
              <a href="/verify">Verify a claim</a>
              <a href="/charter">Charter</a>
              <AccountNav />
            </nav>
          </header>
          {children}
          <footer className="site">
            <p>
              TrustNode is a verification layer, not a chatbot and not an AI fact-checker.
              It grounds claims against identifiable sources and exposes the evidence chain.
              Prototype v{PIPELINE_VERSION} — deterministic pipeline, seeded source corpus.
            </p>
            <p className="num">
              Built under the <a href="/charter">Trust Commons Charter</a> · AI explains; it does not decide.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
