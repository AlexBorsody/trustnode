/** Only return to known application pages; auth URLs never supply an external redirect. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return "/packs";
  try {
    const url = new URL(value, "https://trustnode.local");
    if (url.origin !== "https://trustnode.local" || !/^\/(?:sources|packs(?:\/[0-9a-f-]{36})?|explore|verify|trust|templates)?$/i.test(url.pathname)) return "/packs";
    return url.pathname + url.search;
  } catch { return "/packs"; }
}
