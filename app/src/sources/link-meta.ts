import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { stripHtml } from "@/trustnode/extract";

export function publicAddress(address: string) {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}

export function metadataUrl(value: string) {
  const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port ||
      !host.includes(".") && !isIP(host) || (isIP(host) && !publicAddress(host))) {
    throw new Error("Only public web URLs on standard ports can be fetched.");
  }
  return url;
}

// The validated DNS addresses are passed directly to the socket, avoiding a
// second, unchecked lookup. Each redirect gets its own validation/connection.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, verbatim: true }).then(addresses => {
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) {
      callback(new Error("Non-public destination"), "", 0); return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  }).catch(error => callback(error, "", 0));
};

async function page(url: URL, signal: AbortSignal): Promise<{ html?: string; redirect?: string }> {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      agent: false, lookup: publicLookup, signal,
      headers: { "User-Agent": "TrustNodeBot/0.3", "Accept": "text/html,text/plain", "Accept-Encoding": "identity" },
    }, res => {
      const fail = (message: string) => { res.destroy(); reject(new Error(message)); };
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location) {
        res.destroy(); resolve({ redirect: res.headers.location }); return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) return fail("Page unavailable");
      if (!/^(text\/html|text\/plain|application\/xhtml\+xml)(;|$)/i.test(res.headers["content-type"] ?? "") ||
          (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) return fail("Unsupported page format");
      if (Number(res.headers["content-length"] ?? 0) > 600_000) return fail("Page too large");
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 600_000) { fail("Page too large"); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("aborted", () => reject(new Error("Page interrupted")));
      res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject); req.end();
  });
}

export async function fetchLinkMeta(value: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    let url = metadataUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      const result = await page(url, controller.signal);
      if (result.redirect) { url = metadataUrl(new URL(result.redirect, url).href); continue; }
      const html = result.html ?? "";
      return { title: html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? "", text: stripHtml(html).slice(0, 4000) };
    }
    throw new Error("Too many redirects");
  } finally { clearTimeout(timer); }
}
