import type { AgendaSource } from "@/lib/agenda";

export type ResearchItem = {
  title: string;
  publisher: string;
  url: string;
  published: string;
  excerpt: string;
  access: "article" | "feed" | "title-only";
  collectedAt: string;
};

function decode(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, (entity) =>
      ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity] || entity,
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractArticle(html: string, title: string) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
  const meta = [...clean.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((m) => /(?:name|property)=["'](?:description|og:description)["']/i.test(m));
  const description = meta?.match(/content=["']([^"']{70,})["']/i)?.[1];
  const article = clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || clean;
  const paragraphs = [...article.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1]))
    .filter((p) => p.length >= 80 && p.length <= 1200 && !/subscribe|newsletter|cookie|sign up|advertis/i.test(p));
  const words = title.toLowerCase().match(/[a-z]{4,}|[\p{Script=Han}]{2,}/gu) || [];
  const ranked = paragraphs.map((p, index) => ({
    p,
    score: words.reduce((n, word) => n + Number(p.toLowerCase().includes(word)), 0) - index / 100,
  })).sort((a, b) => b.score - a.score);
  const chosen = ranked[0]?.p || (description ? decode(description) : "");
  return chosen.slice(0, 320);
}

async function readArticle(url: string) {
  const parsed = new URL(url);
  const allowed = ["techcrunch.com", "skift.com", "housingwire.com", "federalreserve.gov", "bis.org", "ecb.europa.eu", "news.google.com"];
  if (parsed.protocol !== "https:" || !allowed.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "text/html" }, redirect: "manual" });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return "";
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 500000) return "";
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 500000) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
    }
    await reader.cancel().catch(() => {});
    const bytes = new Uint8Array(Math.min(total, 500000));
    let offset = 0;
    for (const chunk of chunks) {
      const part = chunk.subarray(0, bytes.length - offset);
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function collectResearch(sources: AgendaSource[]): Promise<ResearchItem[]> {
  const collectedAt = new Date().toISOString();
  return Promise.all(sources.slice(0, 3).map(async (source) => {
    const html = await readArticle(source.url);
    const articleExcerpt = html ? extractArticle(html, source.title) : "";
    const feedExcerpt = source.excerpt?.slice(0, 320) || "";
    return {
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      published: source.published,
      excerpt: articleExcerpt || feedExcerpt,
      access: articleExcerpt ? "article" : feedExcerpt ? "feed" : "title-only",
      collectedAt,
    };
  }));
}

export function parseResearch(raw: unknown): ResearchItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item.title === "string" && typeof item.url === "string" && /^https:\/\//.test(item.url) && typeof item.excerpt === "string" && ["article", "feed", "title-only"].includes(item.access)).slice(0, 3) as ResearchItem[];
}
