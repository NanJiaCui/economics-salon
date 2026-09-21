import { modelRoutes, type ModelRoute } from "@/lib/model-radar";
import { day } from "@/lib/server";

export type AgendaSource = {
  title: string;
  publisher: string;
  url: string;
  published: string;
  category: string;
  excerpt?: string;
};

export type AgendaTopic = {
  id: string;
  day: string;
  category: string;
  tag: string;
  title: string;
  description: string;
  tension: string;
  sources: AgendaSource[];
  generationMode: string;
  freshnessScore: number;
};

type Feed = {
  category: string;
  publisher: string;
  url: string;
  official: boolean;
};

type DatabaseLike = ReturnType<(typeof import("@/lib/server"))["database"]>;

const google = (query: string) =>
  `https://news.google.com/rss/search?${new URLSearchParams({
    q: `${query} when:2d`,
    hl: "zh-CN",
    gl: "CN",
    ceid: "CN:zh-Hans",
  })}`;

const feeds: Feed[] = [
  {
    category: "ai",
    publisher: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    official: false,
  },
  {
    category: "hospitality",
    publisher: "Skift",
    url: "https://skift.com/feed/",
    official: false,
  },
  {
    category: "real-estate",
    publisher: "HousingWire",
    url: "https://www.housingwire.com/feed/",
    official: false,
  },
  {
    category: "ai",
    publisher: "Google News · AI",
    url: google("人工智能 OR AI OR 大模型 OR 芯片"),
    official: false,
  },
  {
    category: "hospitality",
    publisher: "Google News · 酒旅",
    url: google("酒店 OR 旅游 OR OTA OR 航空 OR 文旅"),
    official: false,
  },
  {
    category: "real-estate",
    publisher: "Google News · 房地产",
    url: google("房地产 OR 住房 OR 城市更新 OR REITs"),
    official: false,
  },
  {
    category: "finance",
    publisher: "Google News · 金融",
    url: google("金融 OR 市场 OR 利率 OR 通胀 OR 央行"),
    official: false,
  },
  {
    category: "finance",
    publisher: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    official: true,
  },
  {
    category: "finance",
    publisher: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/speeches.xml",
    official: true,
  },
  {
    category: "finance",
    publisher: "Bank for International Settlements",
    url: "https://www.bis.org/doclist/bis_fsi_publs.rss",
    official: true,
  },
  {
    category: "finance",
    publisher: "Bank for International Settlements",
    url: "https://www.bis.org/doclist/cbspeeches.rss",
    official: true,
  },
  {
    category: "finance",
    publisher: "European Central Bank",
    url: "https://www.ecb.europa.eu/rss/press.html",
    official: true,
  },
  {
    category: "public",
    publisher: "European Central Bank Blog",
    url: "https://www.ecb.europa.eu/rss/blog.html",
    official: true,
  },
];

const categoryMeta: Record<
  string,
  { tag: string; fallbackTitle: string; tension: string }
> = {
  ai: {
    tag: "AI 与技术",
    fallbackTitle: "AI 的下一轮竞争：能力突破，还是成本与应用兑现？",
    tension: "技术能力、商业回报、就业影响与市场集中度可能沿不同速度变化",
  },
  finance: {
    tag: "金融与宏观",
    fallbackTitle: "新的金融信号：短期波动，还是传导机制正在改变？",
    tension: "政策信号、融资条件、资产价格与实体活动之间可能出现时滞或背离",
  },
  hospitality: {
    tag: "酒旅与消费",
    fallbackTitle: "酒旅需求的新变化：真实增量，还是流量重新分配？",
    tension: "出行热度、价格、渠道成本与企业实际收益可能并不同步",
  },
  "real-estate": {
    tag: "房地产与城市",
    fallbackTitle: "房地产的新变量：需求修复，还是存量结构继续调整？",
    tension: "销售、融资、库存、租赁需求与城市分化可能指向不同结论",
  },
  public: {
    tag: "全球公共议题",
    fallbackTitle: "新的全球议题：周期扰动，还是结构已经改变？",
    tension: "短期冲击与长期结构变化需要用不同的时间尺度和证据判断",
  },
};

function decodeXml(value: string) {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
    );
    if (match) return decodeXml(match[1]);
  }
  return "";
}

function link(block: string) {
  const textLink = tag(block, ["link"]);
  if (/^https?:\/\//.test(textLink)) return textLink;
  const attr = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
  return decodeXml(attr);
}

function parseFeed(xml: string, feed: Feed): AgendaSource[] {
  const blocks = [
    ...(xml.match(/<item[\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry[\s\S]*?<\/entry>/gi) || []),
    ...(xml.match(/<rdf:li[\s\S]*?<\/rdf:li>/gi) || []),
  ];
  return blocks
    .map((block) => {
      const title = tag(block, ["title"]);
      const url = link(block);
      const published = tag(block, ["pubDate", "published", "updated", "dc:date"]);
      const publisher = tag(block, ["source", "dc:creator"]) || feed.publisher;
      const excerpt = tag(block, ["description", "summary", "content:encoded"]);
      return {
        title: title.replace(/\s+-\s+[^-]{2,45}$/u, "").slice(0, 220),
        publisher: publisher.slice(0, 100),
        url,
        published,
        category: feed.category,
        excerpt: excerpt.slice(0, 320),
      };
    })
    .filter((item) => item.title.length >= 8 && /^https?:\/\//.test(item.url));
}

async function fetchFeed(feed: Feed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(feed.url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, text/xml",
        "User-Agent": "EconomicsSalon/1.0 (+https://economics-salon-yfcui.jijicyf.chatgpt.site)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${feed.publisher} ${response.status}`);
    const xml = await response.text();
    return parseFeed(xml, feed).map((item) => ({ item, official: feed.official }));
  } finally {
    clearTimeout(timer);
  }
}

function recency(source: AgendaSource, official: boolean) {
  const timestamp = Date.parse(source.published);
  const hours = Number.isFinite(timestamp)
    ? Math.max(0, (Date.now() - timestamp) / 3600000)
    : 168;
  return Math.max(0, 100 - hours / 3) + (official ? 24 : 0);
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function focusTitle(category: string, source?: AgendaSource) {
  const meta = categoryMeta[category] || categoryMeta.public;
  if (!source) return meta.fallbackTitle;
  let headline = source.title
    .split(/[？?！!]/u)[0]
    .replace(/^(重磅|最新|刚刚)[：:\s]*/u, "")
    .replace(/答案在.*$/u, "")
    .replace(/[。.!！]+$/u, "")
    .trim();
  if (headline.length > 72) {
    headline = headline.slice(0, 72).replace(/\s+\S*$/u, "").trim();
  }
  return `${headline}：短期信号，还是结构变化？`;
}

function ruleTopics(
  grouped: Map<string, AgendaSource[]>,
  date: string,
): AgendaTopic[] {
  const order = ["ai", "finance", "hospitality", "real-estate"];
  return order.map((category, index) => {
    const meta = categoryMeta[category];
    const evidence = (grouped.get(category) || []).slice(0, 3);
    const lead = evidence[0];
    const title = focusTitle(category, lead);
    return {
      id: `agenda-${date}-${category}-${hash(title)}`,
      day: date,
      category,
      tag: meta.tag,
      title,
      description: lead
        ? `今日线索来自${lead.publisher}：《${lead.title}》。沙龙将围绕“${meta.tension}”核验不同解释。`
        : `公开来源暂未返回稳定的新条目，编辑规则以该领域的核心矛盾建立备用议题。`,
      tension: meta.tension,
      sources: evidence,
      generationMode: "source-rules",
      freshnessScore: lead
        ? Math.max(1, Math.round(recency(lead, false)))
        : Math.max(1, 4 - index),
    };
  });
}

function extractJson(text: string) {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate =
    fenced ||
    withoutThinking.slice(
      withoutThinking.indexOf("{"),
      withoutThinking.lastIndexOf("}") + 1,
    );
  return JSON.parse(candidate) as {
    topics?: Array<{
      category?: string;
      title?: string;
      description?: string;
      tension?: string;
      sourceIndexes?: number[];
    }>;
  };
}

async function requestAgenda(route: ModelRoute, evidence: AgendaSource[]) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${route.key}`,
    "Content-Type": "application/json",
  };
  const prompt = [
    "你是国际议题沙龙的值班编辑。只能依据给定标题与来源生成候选议题，不得补写新闻事实。",
    "输出严格 JSON：{topics:[{category,title,description,tension,sourceIndexes}]}。",
    "生成四个中文议题，category 必须各使用一次 ai、finance、hospitality、real-estate。",
    "title 是有真实冲突的问句；description 说明为何值得讨论并标注仍需核验；tension 提炼两个可能冲突的机制；sourceIndexes 只能引用输入序号。",
    "每个议题至少引用一个来源，优先新近且具体的材料。不要把标题当作已验证事实。",
    JSON.stringify(evidence.map((item, index) => ({ index, title: item.title, publisher: item.publisher, url: item.url, published: item.published, category: item.category }))),
  ].join("\n");
  if (route.adapter === "cloudflare") {
    const response = await fetch(`${route.baseUrl}/${route.model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1100,
        temperature: 0.25,
      }),
    });
    if (!response.ok) throw new Error(`agenda ${response.status}`);
    const data = (await response.json()) as { result?: { response?: string } };
    return data.result?.response || "";
  }
  const response = await fetch(`${route.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: route.model,
      messages: [{ role: "user", content: prompt }],
      ...(route.id === "minimax"
        ? { max_completion_tokens: 1100, temperature: 1, top_p: 0.95 }
        : {
            max_tokens: 1100,
            temperature: 0.25,
            response_format: { type: "json_object" },
          }),
    }),
  });
  if (!response.ok) throw new Error(`agenda ${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content || "";
}

async function modelTopics(evidence: AgendaSource[], date: string) {
  const routes = modelRoutes()
    .filter((route) => route.free || route.id === "minimax")
    .sort((left, right) => right.priority - left.priority);
  for (const route of routes) {
    try {
      const parsed = extractJson(await requestAgenda(route, evidence));
      const topics = parsed.topics || [];
      if (topics.length !== 4) throw new Error("agenda incomplete");
      const expected = new Set(["ai", "finance", "hospitality", "real-estate"]);
      const result = topics.map((topic) => {
        const category = String(topic.category || "");
        if (!expected.delete(category)) throw new Error("agenda category invalid");
        const title = String(topic.title || "").trim().slice(0, 120);
        const meta = categoryMeta[category];
        const sources = (topic.sourceIndexes || [])
          .map((index) => evidence[index])
          .filter(Boolean)
          .slice(0, 3);
        if (title.length < 8 || !sources.length) throw new Error("agenda evidence missing");
        return {
          id: `agenda-${date}-${category}-${hash(title)}`,
          day: date,
          category,
          tag: meta.tag,
          title,
          description: String(topic.description || "").trim().slice(0, 280),
          tension: String(topic.tension || meta.tension).trim().slice(0, 240),
          sources,
          generationMode: `${route.free ? "free-model" : "model"}:${route.id}`,
          freshnessScore: Math.max(
            1,
            ...sources.map((source) => Math.round(recency(source, false))),
          ),
        } satisfies AgendaTopic;
      });
      if (expected.size) throw new Error("agenda diversity missing");
      return result;
    } catch {
      // Try the next configured free route before using the source-backed rules.
    }
  }
  return null;
}

async function collectAgenda(date: string) {
  const results = await Promise.allSettled(
    feeds.map(fetchFeed),
  );
  const rows = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const unique = new Map<string, { item: AgendaSource; official: boolean }>();
  for (const row of rows) {
    if (/\b(?:days? left|register now|early bird|ticket|sponsored|newsletter|podcast|webinar|event preview|enforcement action|closed-door arbitration)\b/i.test(row.item.title)) continue;
    const key = row.item.title
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "")
      .slice(0, 100);
    if (!unique.has(key)) unique.set(key, row);
  }
  const ranked = [...unique.values()].sort(
    (left, right) =>
      recency(right.item, right.official) - recency(left.item, left.official),
  );
  const evidence = ["ai", "finance", "hospitality", "real-estate", "public"]
    .flatMap((category) =>
      ranked.filter((row) => row.item.category === category).slice(0, 6),
    )
    .map((row) => row.item);
  const grouped = new Map<string, AgendaSource[]>();
  for (const item of evidence)
    grouped.set(item.category, [...(grouped.get(item.category) || []), item]);
  return (await modelTopics(evidence, date)) || ruleTopics(grouped, date);
}

function rowToTopic(row: Record<string, unknown>): AgendaTopic {
  let sources: AgendaSource[] = [];
  try {
    sources = JSON.parse(String(row.sources_json || "[]"));
  } catch {
    sources = [];
  }
  return {
    id: String(row.id),
    day: String(row.day),
    category: String(row.category),
    tag: String(row.tag),
    title: String(row.title),
    description: String(row.description),
    tension: String(row.tension),
    sources,
    generationMode: String(row.generation_mode),
    freshnessScore: Number(row.freshness_score) || 0,
  };
}

export async function getAgenda(db: DatabaseLike, date = day()) {
  const rows = await db
    .prepare(
      "SELECT * FROM agenda_topics WHERE day=? ORDER BY freshness_score DESC,created ASC",
    )
    .bind(date)
    .all<Record<string, unknown>>();
  return rows.results.map(rowToTopic);
}

export async function ensureDailyAgenda(db: DatabaseLike, date = day()) {
  const existing = await getAgenda(db, date);
  if (existing.length >= 4 && existing.every((topic) => topic.sources.length))
    return existing;
  const topics = await collectAgenda(date);
  const created = Date.now();
  await db.batch(
    topics.map((topic) => {
      const prior = existing.find((item) => item.category === topic.category);
      if (prior)
        return db
          .prepare(
            "UPDATE agenda_topics SET tag=?,title=?,description=?,tension=?,sources_json=?,generation_mode=?,freshness_score=?,created=? WHERE id=?",
          )
          .bind(
            topic.tag,
            topic.title,
            topic.description,
            topic.tension,
            JSON.stringify(topic.sources),
            topic.generationMode,
            topic.freshnessScore,
            created,
            prior.id,
          );
      return db
        .prepare(
          "INSERT OR IGNORE INTO agenda_topics (id,day,category,tag,title,description,tension,sources_json,generation_mode,freshness_score,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          topic.id,
          topic.day,
          topic.category,
          topic.tag,
          topic.title,
          topic.description,
          topic.tension,
          JSON.stringify(topic.sources),
          topic.generationMode,
          topic.freshnessScore,
          created,
        );
    }),
  );
  return getAgenda(db, date);
}

export function agendaContext(topic: AgendaTopic) {
  return JSON.stringify({
    category: topic.category,
    tag: topic.tag,
    tension: topic.tension,
    sources: topic.sources,
    generationMode: topic.generationMode,
  });
}

export function parseAgendaContext(value: unknown) {
  try {
    return JSON.parse(String(value || "{}")) as {
      category?: string;
      tag?: string;
      tension?: string;
      sources?: AgendaSource[];
      research?: import("@/lib/research").ResearchItem[];
      generationMode?: string;
    };
  } catch {
    return {};
  }
}
