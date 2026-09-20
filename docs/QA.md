# TrustNode Baseline QA — MUSE-002

**Date:** 2026-09-20 ~07:15–07:40 EDT
**Environment:** Chromium via automation, desktop ~1920px. Strictly read-only — no data created, modified, or deleted.
**Target:** https://trustnode-lemon.vercel.app (production)
**Deployed indicators:** footer "Prototype v0.2.0 — deterministic pipeline, seeded source corpus."; site data dated 2026-09-19.

## Results: 8/10 pass, 1 pass-with-note, 1 blocked (tooling)

### 1. Home (/) — PASS
Meta-line: `PROTOTYPEv0.2.0· DETERMINISTIC PIPELINE · SEEDED CORPUS (OAUTH/PKCE)`. All nav links verified by click: Home, Verify a claim, Charter.
Cosmetic: no space between "PROTOTYPE" and "v0.2.0" (same on /verify).

### 2. /verify positive claim — PASS
Input: "PKCE (RFC 7636) protects OAuth public clients against authorization code interception attacks".
Observed: `CONFIDENCE: 100/100 WELL SUPPORTED`, formula line shown, 6 sources retrieved (RFC 7636 ×2, RFC 9700, Okta SUPPORTS; Auth0 + Stack Overflow UNRELATED).

### 3. /verify negated claim — PASS
Input: "PKCE does not protect against authorization code interception".
Observed: `CONFIDENCE: 0/100 UNSUPPORTED` with negation note: sources contradict its positive form. Correct inversion behavior.

### 4. /verify irrelevant claim — PASS (recorded)
Input: "Pineapples grow best in cold climates". Observed: `0/100 UNSUPPORTED`, 1 source retrieved (RFC 9700, stance UNRELATED).

### 5. /verify determinism — PASS
Positive claim submitted twice consecutively: identical verdict, confidence, formula, and evidence chain. Deterministic.

### 6. /verify input errors — PASS with note
- Empty claim: submit is a silent no-op; previous result panel remains, no error shown. **Minor UX gap → BUG-007.**
- ~18k-char claim: inline error "claim too long (max 500 chars)"; form stays editable. After the error, a valid claim submits normally — recovery works.

### 7. /sources — PASS
Meta-line: `SOURCE COMMONSv0.1· FILES + LINKS · CATEGORIES + TAGS · PUBLIC READ, SIGNED-IN WRITE`. 2 seeded sources. Search "PKCE" → 2 results; "TEST-NOTE" → 1; "pineapples" → proper empty state. Category filter "Standards & RFCs" works. **No pagination controls visible** (backend limit/offset shipped; UI has none — noted 2026-09-20, no action filed yet).
Note: a signed-in session (asborsody@gmail.com) was present with write forms; not exercised per read-only scope.

### 8. /charter — PASS
Header: `TRUST COMMONS CHARTER v2.0 · DRAFT — PENDING SIGN-OFF · AMENDMENTS REQUIRE A NEW VERSION`. 9 articles render (I Trust over speed … IX Evolution of this charter). No edit controls visible — consistent with the amendment policy.

### 9. Narrow-screen layout — BLOCKED (tooling, not site)
Automation has no viewport-resize action; DevTools would not open. Not visually inspected at 390px. Partial evidence: `<meta name="viewport">` present; stylesheet has one `@media (max-width:720px)` breakpoint (stacks topbar, shrinks title, 2-col score grid). **Needs a hand check on a real phone.**

### 10. Loading/error recovery — PASS
No stuck loading states anywhere. Error/empty states behave except the empty-claim silent no-op (BUG-007).

## Bugs filed from this pass
- **BUG-007** (minor): empty claim submit gives no feedback — previous result silently remains. Expect an inline hint like the max-length error.
