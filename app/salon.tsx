"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Radio,
  MessageSquare,
  Scale,
  FileText,
  ArrowUp,
  Download,
  X,
  Check,
  Search,
  LogIn,
  Sparkles,
  Clock3,
  Play,
  Pause,
  SkipForward,
  Lightbulb,
} from "lucide-react";
import { thinkers, sources, topic } from "@/lib/content";
declare global {
  interface Document {
    modelContext?: { registerTool: (...args: unknown[]) => void };
  }
}
type Message = {
  id: string;
  speaker: string;
  body: string;
  round: number;
  kind: string;
};
type Session = {
  id: string;
  title: string;
  status: string;
  round: number;
  turn: number;
  next_at: number;
  engine_state: string;
  last_error?: string;
  created: number;
  mode: string;
  scope: string;
};
type Question = {
  id: string;
  body: string;
  target: string;
  votes: number;
  liked: number;
  status: string;
};
type Engine = {
  state: string;
  turn: number;
  total: number;
  nextAt: number | null;
  lastError: string | null;
  currentSpeaker: string | null;
  currentKind: string | null;
  provider: string;
  model: string | null;
  phases: string[];
};
type Funding = {
  totals: { currency: string; amount: number; payments: number }[];
  supporters: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
    estimated_microusd: number;
    calls: number;
  };
  paymentUrl: string | null;
  paymentReady: boolean;
};
type AgendaSource = {
  title: string;
  publisher: string;
  url: string;
  published: string;
  category: string;
};
type Candidate = {
  id: string;
  category: string;
  tag: string;
  title: string;
  description: string;
  tension: string;
  sources: AgendaSource[];
  generationMode: string;
};
type ModelRadar = {
  scannedAt: string;
  catalogOnline: boolean;
  active: { provider: string; label: string; model: string } | null;
  providers: {
    id: string;
    label: string;
    credential: string;
    offer: string;
    detail: string;
    source: string;
    configured: boolean;
    active: boolean;
  }[];
  freeModels: {
    id: string;
    name: string;
    context: number;
    structured: boolean;
  }[];
  policy: string[];
};
type State = {
  user: { name: string } | null;
  mode: string;
  session: Session | null;
  sessions: Session[];
  messages: Message[];
  questions: Question[];
  votes: { topic: string; votes: number; people: number }[];
  candidates: Candidate[];
  topicSources: AgendaSource[];
  agenda: {
    collectedAt: string;
    generationMode: string;
    categories: string[];
  };
  remaining: number;
  engine: Engine;
  funding: Funding;
};
const empty: State = {
  user: null,
  mode: "demo",
  session: null,
  sessions: [],
  messages: [],
  questions: [],
  votes: [],
  candidates: [],
  topicSources: [],
  agenda: { collectedAt: "", generationMode: "source-rules", categories: [] },
  remaining: 5,
  funding: {
    totals: [],
    supporters: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cached_tokens: 0,
      estimated_microusd: 0,
      calls: 0,
    },
    paymentUrl: null,
    paymentReady: false,
  },
  engine: {
    state: "waiting",
    turn: 0,
    total: 14,
    nextAt: null,
    lastError: null,
    currentSpeaker: null,
    currentKind: null,
    provider: "openai",
    model: null,
    phases: ["08:30", "13:30", "18:30"],
  },
};
const names = ["独立判断", "交叉质询", "证据更新"];
function fundingAmount(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
    }).format(amount / 100);
  } catch {
    return `${currency} ${(amount / 100).toFixed(2)}`;
  }
}
function tokenAmount(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}
function modelCost(microusd: number) {
  if (microusd > 0 && microusd < 10000) return "< $0.01";
  return `$${(microusd / 1000000).toFixed(2)}`;
}
function contextAmount(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
}
export default function Salon() {
  const [tab, setTab] = useState("今日会场"),
    [state, setState] = useState<State>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [filter, setFilter] = useState(0),
    [modal, setModal] = useState<string | null>(null),
    [question, setQuestion] = useState(""),
    [target, setTarget] = useState("host"),
    [query, setQuery] = useState(""),
    [radar, setRadar] = useState<ModelRadar | null>(null),
    [radarLoading, setRadarLoading] = useState(true),
    [stageIndex, setStageIndex] = useState(0),
    [stagePlaying, setStagePlaying] = useState(true),
    [typedLength, setTypedLength] = useState(0);
  const selectedRef = useRef<string | null>(null),
    draftRef = useRef<HTMLTextAreaElement>(null),
    busyRef = useRef(false),
    pulseRef = useRef(false);
  const load = useCallback(async (id?: string, replace = true) => {
    const r = await fetch(
      "/api/state" + (id ? "?session=" + encodeURIComponent(id) : ""),
    );
    const d = (await r.json()) as State & { error?: string };
    if (!r.ok) throw new Error(d.error || "无法读取会场状态。");
    setState(d);
    selectedRef.current = d.session?.id ?? null;
    if (replace) setMessages(d.messages);
    return d as State;
  }, []);
  useEffect(() => {
    // Initial data loading is the external synchronization this effect owns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  const loadRadar = useCallback(async (force = false) => {
    const response = await fetch(force ? `/api/models?refresh=${Date.now()}` : "/api/models", {
      cache: force ? "no-store" : "default",
    });
    const data = (await response.json()) as ModelRadar & { error?: string };
    if (!response.ok) throw new Error(data.error || "模型雷达暂时不可用。");
    setRadar(data);
    setRadarLoading(false);
  }, []);
  useEffect(() => {
    if (tab !== "模型与赞助" || radar) return;
    // Loading the external provider catalog is the synchronization owned here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRadar().catch((e) => {
      setRadarLoading(false);
      setError(e instanceof Error ? e.message : "模型雷达暂时不可用。");
    });
  }, [tab, radar, loadRadar]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busyRef.current && !pulseRef.current)
        load(selectedRef.current || undefined, true).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const pulse = useCallback(async () => {
    if (pulseRef.current) return;
    pulseRef.current = true;
    try {
      const response = await fetch("/api/autopilot", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "沙龙引擎暂时无法推进。");
      await load(selectedRef.current || undefined, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "沙龙引擎暂时无法推进。");
    } finally {
      pulseRef.current = false;
    }
  }, [load]);
  const selectedSessionId = state.session?.id;
  const selectedSessionStatus = state.session?.status;
  const latestSessionId = state.sessions[0]?.id;
  useEffect(() => {
    if (
      !selectedSessionId ||
      !latestSessionId ||
      selectedSessionId !== latestSessionId ||
      selectedSessionStatus === "complete"
    )
      return;
    const timer = setInterval(pulse, 4500);
    if (state.engine.nextAt === null || state.engine.nextAt <= Date.now() + 500)
      void pulse();
    return () => clearInterval(timer);
  }, [
    selectedSessionId,
    selectedSessionStatus,
    latestSessionId,
    state.engine.nextAt,
    pulse,
  ]);
  async function action(data: Record<string, unknown>) {
    const r = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const d = (await r.json()) as Record<string, unknown> & { error?: string };
    if (!r.ok) throw new Error(d.error || "操作失败，请稍后重试。");
    return d;
  }
  function requireUser() {
    if (state.user) return true;
    setModal("login");
    return false;
  }
  async function vote(id: string) {
    if (!requireUser() || busy) return;
    setBusy(true);
    setError("");
    try {
      await action({ action: "vote", topic: id });
      await load(selectedRef.current || undefined, false);
      setNotice("已投出一票。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitQuestion() {
    if (!requireUser() || !question.trim() || !state.session) return;
    setError("");
    setBusy(true);
    try {
      await action({
        action: "question",
        session: state.session.id,
        body: question,
        target,
      });
      await load(state.session.id, true);
      setQuestion("");
      setNotice("问题已加入队列，主持人会在下一个主持节点选取最高票问题。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function like(q: Question) {
    if (!requireUser() || !state.session || q.liked) return;
    try {
      await action({
        action: "like",
        session: state.session.id,
        question: q.id,
      });
      await load(state.session.id, false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openSession(s: Session) {
    selectedRef.current = s.id;
    await load(s.id).catch((e) => setError(e.message));
    setTab("今日会场");
    setFilter(0);
    document.getElementById("floor")?.scrollIntoView({ behavior: "smooth" });
  }
  function exportNotes() {
    if (!messages.length) return;
    const result =
      `# ${state.session?.title || topic}\n\n${state.session?.mode === "live" ? "AI 自运转讨论" : "议题演算引擎，非实时 AI 观点"}\n\n` +
      messages
        .map(
          (m) =>
            `## 第 ${m.round} 轮 · ${thinkers.find((t) => t.id === m.speaker)?.cn || "主持人"} · ${m.kind}\n\n${m.body}`,
        )
        .join("\n\n") +
      "\n\n## 原始文献\n" +
      [
        ...state.topicSources.map((source) => ({
          author: `${source.publisher} · 议题线索`,
          url: source.url,
        })),
        ...sources,
      ]
        .map((s) => `- [${s.author}](${s.url})`)
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([result], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "Economics-Salon-讨论纪要.md";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("纪要已导出。");
  }
  function navigate(section: string) {
    setTab(section);
    setError("");
  }
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const ctl = new AbortController();
    context.registerTool(
      {
        name: "navigate_salon_section",
        title: "打开沙龙栏目",
        description:
          "切换到今日会场、议题广场、思想家库、模型与赞助或沙龙档案，不提交问题或投票。",
        inputSchema: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: [
                "今日会场",
                "议题广场",
                "思想家库",
                "模型与赞助",
                "沙龙档案",
              ],
            },
          },
          required: ["section"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async ({ section }: { section: string }) => {
          if (
            ![
              "今日会场",
              "议题广场",
              "思想家库",
              "模型与赞助",
              "沙龙档案",
            ].includes(section)
          )
            throw new Error("未知栏目");
          setTab(section);
          return { section };
        },
      },
      { signal: ctl.signal },
    );
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    const dialog = document.getElementById("salon-dialog");
    const elements = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button,a,input,textarea,select",
        ) || [],
      );
    elements()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const es = elements();
        if (e.shiftKey && document.activeElement === es[0]) {
          e.preventDefault();
          es.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === es.at(-1)) {
          e.preventDefault();
          es[0]?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, [modal]);
  const stageMessage = messages.length
    ? messages[Math.min(stageIndex, messages.length - 1)]
    : null;
  const stageMessageId = stageMessage?.id;
  const stageMessageBody = stageMessage?.body || "";
  useEffect(() => {
    if (!messages.length) return;
    // New server turns should become part of the local listening sequence.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStageIndex((index) => Math.min(index, messages.length - 1));
  }, [messages.length]);
  useEffect(() => {
    if (!stagePlaying || messages.length < 2) return;
    const timer = setInterval(
      () => setStageIndex((index) => (index + 1) % messages.length),
      9500,
    );
    return () => clearInterval(timer);
  }, [stagePlaying, messages.length]);
  useEffect(() => {
    if (!stageMessageId) return;
    // Restart the type-on animation whenever the listening stage changes speaker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTypedLength(0);
    const chunk = Math.max(1, Math.ceil(stageMessageBody.length / 72));
    const timer = setInterval(() => {
      setTypedLength((length) => {
        const next = Math.min(stageMessageBody.length, length + chunk);
        if (next >= stageMessageBody.length) clearInterval(timer);
        return next;
      });
    }, 28);
    return () => clearInterval(timer);
  }, [stageMessageId, stageMessageBody]);
  const selectedThinker = thinkers.find((t) => t.id === modal);
  const evidenceSources = [
    ...state.topicSources.map((source) => ({
      title: source.title,
      author: `${source.publisher}${source.published ? ` · ${source.published}` : ""}`,
      url: source.url,
      note: "这是每日议题采集器保存的原始标题与来源链接。标题只作为讨论线索，正文事实仍需回到原始页面核验。",
      kind: "现实线索",
    })),
    ...sources.map((source) => ({ ...source, kind: "理论文献" })),
  ];
  const currentRound = state.session?.round || 0;
  const visible = filter
    ? messages.filter((x) => x.round === filter)
    : messages;
  const nextThinker = thinkers.find(
    (t) => t.id === state.engine.currentSpeaker,
  );
  const stageThinker = thinkers.find((t) => t.id === stageMessage?.speaker);
  const explicitTargetThinker = thinkers.find((thinker) =>
    stageMessage?.kind.includes(thinker.cn),
  );
  const previousStageMessages = messages.slice(0, stageIndex).reverse();
  const basisMessage = explicitTargetThinker
    ? previousStageMessages.find(
        (message) => message.speaker === explicitTargetThinker.id,
      )
    : previousStageMessages[0];
  const basisThinker = thinkers.find(
    (thinker) => thinker.id === basisMessage?.speaker,
  );
  const basisName = basisMessage
    ? basisThinker
      ? `${basisThinker.cn}框架`
      : "主持人引导"
    : "主持人引导";
  const basisText = basisMessage
    ? basisMessage.body.slice(0, 54) + (basisMessage.body.length > 54 ? "…" : "")
    : `围绕“${state.session?.title || topic}”提出可检验的判断。`;
  const stageSpeakerName = stageThinker
    ? `${stageThinker.cn}框架`
    : "沙龙主持人";
  const stageContribution = stageThinker
    ? stageThinker.mechanism
    : "把分歧整理为可检验的问题，并决定下一位发言者。";
  const stageQuestion = stageThinker
    ? stageThinker.question
    : "哪些事实会让不同框架改变当前判断？";
  const stageTarget = explicitTargetThinker
    ? `${explicitTargetThinker.cn}框架`
    : basisName;
  const isThinking = state.engine.state === "thinking";
  return (
    <>
      <header>
        {/* vinext's client Link shim can load a duplicate React instance. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/">
          <span className="brand-mark">
            E<span>∴</span>
          </span>
          <span>
            ECONOMICS SALON<small>经济思想沙龙</small>
          </span>
        </a>
        <nav aria-label="主导航">
          {["今日会场", "议题广场", "思想家库", "模型与赞助", "沙龙档案"].map(
            (x) => (
              <button
                aria-current={tab === x ? "page" : undefined}
                className={tab === x ? "active" : ""}
                key={x}
                onClick={() => navigate(x)}
              >
                {x}
              </button>
            ),
          )}
        </nav>
        <button
          className="account"
          onClick={() => setModal(state.user ? "account" : "login")}
        >
          {state.user ? "我的席位" : "进入沙龙"} <ArrowUpRight size={15} />
        </button>
      </header>
      <div className="edition">
        <span>AUTONOMOUS MINDS. SHARED QUESTIONS.</span>
        <span>
          DAILY SESSION <span className="dot">·</span> 中文讨论 / EN 文献
        </span>
      </div>
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button
            onClick={() => {
              setError("");
              void pulse();
            }}
          >
            重新连接引擎
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      <main>
        {tab === "今日会场" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="live-dot" /> AUTONOMOUS DAILY SALON{" "}
                  <span className="pill">
                    {state.mode === "live" ? "AI 自运转" : "自运转 · 议题演算"}
                  </span>
                </div>
                <h1>{state.session?.title || topic}</h1>
                <p>
                  主持人选择框架，代理依次发言、交叉质询、根据新条件修正判断。
                  <br />
                  会场会自己向前推进，你只需要观看、提问与投票。
                </p>
                <div className="hero-bottom">
                  <button
                    className="primary"
                    onClick={() =>
                      document
                        .getElementById("floor")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    <Radio size={14} /> 进入正在发生的讨论{" "}
                    <ArrowRight size={17} />
                  </button>
                  <span>
                    5 位思想代理 <i /> 每日 3 次生成 <i /> 自动归档
                  </span>
                </div>
              </div>
              <div
                className="roundtable"
                aria-label="五种思想围绕共同议题的圆桌示意"
              >
                <div className="orbit one" />
                <div className="orbit two" />
                <div className="orbit three" />
                <div className="center-seal">
                  <Scale size={25} />
                  <span>
                    THE
                    <br />
                    ROUND TABLE
                  </span>
                  <small>以分歧，接近理解</small>
                </div>
                {thinkers.map((t, i) => (
                  <button
                    className={
                      "seat seat-" +
                      i +
                      ((stageMessage?.speaker || state.engine.currentSpeaker) ===
                      t.id
                        ? " speaking"
                        : "")
                    }
                    key={t.id}
                    onClick={() => setModal(t.id)}
                    aria-label={"查看" + t.cn + "思想卡"}
                  >
                    <span>{t.initials}</span>
                    <small>{t.cn}</small>
                  </button>
                ))}
                <span className="figure-label">
                  FIG. 01 — THE SALON IS RUNNING
                </span>
              </div>
            </section>
            <div className="principle">
              <span>本期议题</span>
              <p>{state.session?.title || topic}</p>
              <Scale size={18} />
            </div>
            <section className="floor" id="floor">
              <aside className="agenda">
                <div className="section-label">THE PROGRAMME</div>
                <h3>讨论进程</h3>
                {names.map((x, i) => (
                  <button
                    className={
                      "step " +
                      ((
                        filter
                          ? filter === i + 1
                          : Math.min(currentRound, 2) === i
                      )
                        ? "selected"
                        : "")
                    }
                    key={x}
                    onClick={() => setFilter(filter === i + 1 ? 0 : i + 1)}
                  >
                    <span>
                      {currentRound > i ? <Check size={12} /> : "0" + (i + 1)}
                    </span>
                    <div>
                      {x}
                      <small>
                        {
                          [
                            "先提出可证伪的判断",
                            "让不同机制彼此约束",
                            "哪些证据会改变结论",
                          ][i]
                        }
                      </small>
                    </div>
                  </button>
                ))}
                <button
                  className="text-button view-all"
                  onClick={() => setFilter(0)}
                >
                  查看全部发言 →
                </button>
                <div className="agenda-note">
                  <BookOpen size={18} />
                  <p>
                    好的讨论，不止于立场。
                    <br />
                    更在于判断成立的条件。
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("method")}
                >
                  阅读沙龙方法 <ArrowUpRight size={12} />
                </button>
              </aside>
              <article className="conversation">
                <div className="section-head">
                  <h2>
                    <Radio size={18} /> 圆桌现场
                  </h2>
                  <span>
                    {loading
                      ? "会场连接中"
                      : state.session?.status === "complete"
                        ? "本期讨论已自动归档"
                        : isThinking
                          ? `${nextThinker?.cn || "主持人"}正在形成判断…`
                          : `第 ${Math.min(currentRound + 1, 3)} 轮 · ${names[Math.min(currentRound, 2)]}`}
                  </span>
                </div>
                <div className="host-message">
                  <div className="speaker">
                    <span className="avatar host">ES</span>
                    <div>
                      <b>沙龙主持人</b>
                      <small>自主编排 · 问题与证据</small>
                    </div>
                    <span className="message-type">会场协议</span>
                  </div>
                  <h3>理论要说明自己在什么条件下成立。</h3>
                  <p>
                    代理不会排队念稿。主持人根据议题和前文选择下一种框架；第二轮必须质询另一个框架，第三轮必须说明什么证据会改变判断。
                  </p>
                  <blockquote>
                    技术进步、宏观生产率和投资回报，是三个需要分别验证的问题。
                  </blockquote>
                </div>
                <section className="salon-stage" aria-live="polite">
                  <div className="stage-kicker">
                    <span className="live-dot" /> 动态旁听
                    <span>{stagePlaying ? "自动播放中" : "已暂停"}</span>
                    <small>
                      {messages.length
                        ? `${Math.min(stageIndex + 1, messages.length)} / ${messages.length}`
                        : "等待开场"}
                    </small>
                  </div>
                  {stageMessage ? (
                    <>
                      <div className="stage-speaker">
                        <button
                          className={"stage-avatar " + (!stageThinker ? "host" : "")}
                          onClick={() =>
                            setModal(stageThinker?.id || "method")
                          }
                          aria-label={`查看${stageSpeakerName}思想卡`}
                        >
                          {stageThinker?.initials || "ES"}
                          <span className="stage-signal" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                        </button>
                        <div>
                          <small>NOW SPEAKING</small>
                          <h3>{stageSpeakerName}正在发言</h3>
                          <p>
                            第 {stageMessage.round} 轮 · {stageMessage.kind}
                            {stageTarget ? ` · 面向${stageTarget}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="stage-basis">
                        <span>承接</span>
                        <b>{basisName}</b>
                        <p>“{basisText}”</p>
                      </div>
                      <p className="stage-speech">
                        {stageMessage.body.slice(0, typedLength)}
                        {typedLength < stageMessage.body.length && (
                          <span className="typing-cursor" aria-hidden="true" />
                        )}
                      </p>
                      <div className="idea-ribbon">
                        <div className="idea-icon">
                          <Lightbulb size={17} />
                        </div>
                        <div>
                          <small>
                            {stageMessage.round === 1
                              ? "新加入的观察角度"
                              : stageMessage.round === 2
                                ? "对上一观点的补充"
                                : "根据条件修正判断"}
                          </small>
                          <b>{stageThinker?.field || "主持与综合"}</b>
                          <p>{stageContribution}</p>
                          <em>继续追问：{stageQuestion}</em>
                        </div>
                      </div>
                      <div className="stage-footer">
                        <div className="thought-trail" aria-label="发言顺序">
                          {messages.map((message, index) => {
                            const thinker = thinkers.find(
                              (item) => item.id === message.speaker,
                            );
                            return (
                              <button
                                className={index === stageIndex ? "active" : ""}
                                key={message.id}
                                onClick={() => {
                                  setStageIndex(index);
                                  setStagePlaying(false);
                                }}
                                aria-label={`播放${thinker?.cn || "主持人"}的发言`}
                              >
                                {thinker?.initials || "ES"}
                              </button>
                            );
                          })}
                        </div>
                        <div className="stage-controls">
                          <button
                            onClick={() => setStagePlaying((playing) => !playing)}
                            aria-label={stagePlaying ? "暂停动态旁听" : "继续动态旁听"}
                          >
                            {stagePlaying ? <Pause size={14} /> : <Play size={14} />}
                            {stagePlaying ? "暂停" : "继续"}
                          </button>
                          <button
                            onClick={() => {
                              setStageIndex((index) =>
                                messages.length ? (index + 1) % messages.length : 0,
                              );
                              setStagePlaying(false);
                            }}
                          >
                            <SkipForward size={14} /> 下一位
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="stage-waiting">
                      <Sparkles size={22} />
                      <p>主持人正在邀请第一位思想代理进入讨论。</p>
                    </div>
                  )}
                </section>
                <div className="thinker-row">
                  {thinkers.map((t) => (
                    <button
                      className={
                        (stageMessage?.speaker || state.engine.currentSpeaker) ===
                        t.id
                          ? "agent-active"
                          : ""
                      }
                      key={t.id}
                      onClick={() => setModal(t.id)}
                    >
                      <span className="avatar">{t.initials}</span>
                      <b>{t.cn}</b>
                      <small>{t.field}</small>
                    </button>
                  ))}
                </div>
                <div className="engine-panel">
                  <div
                    className={"engine-pulse " + (isThinking ? "thinking" : "")}
                  >
                    <Sparkles size={15} />
                  </div>
                  <div>
                    <b>
                      {state.session?.status === "complete"
                        ? "今日沙龙已完成"
                        : isThinking
                          ? `${nextThinker?.cn || "主持人"}正在发言`
                          : `下一位：${nextThinker?.cn || "主持人"}`}
                    </b>
                    <small>
                      {state.mode === "live"
                        ? `由 ${state.engine.model || "低成本模型"} 按轮生成`
                        : "议题演算引擎按自主时钟推进；接入模型后即时生成"}{" "}
                      · {state.engine.turn}/{state.engine.total} 发言
                    </small>
                  </div>
                  <div className="engine-clock">
                    <Clock3 size={14} />
                    <span>
                      {state.session?.status === "complete"
                        ? "明日自动开启新议题"
                        : isThinking
                          ? "正在生成"
                          : "自动等待下一节点"}
                    </span>
                  </div>
                </div>
                <p className="mode-note">
                  {state.mode === "live"
                    ? "每轮只调用一次模型，并把发言按自治时钟依次释放。上一轮会被压缩为观点账本，减少重复 Token。观点、事实与引用仍需人工核验。"
                    : "当前没有模型凭据，系统按每日议题与五位思想代理的蒸馏框架动态演算；接入后每轮只调用一次模型。提问、投票、轮次、议题选择与档案都是真实动态状态。"}
                </p>
                <div className="transcript" aria-live="polite">
                  {visible.map((m) => {
                    const t = thinkers.find((t) => t.id === m.speaker);
                    return (
                      <div className="turn" key={m.id}>
                        <div className="speaker">
                          <button
                            className={"avatar " + (!t ? "host" : "")}
                            onClick={() => setModal(t?.id || "method")}
                          >
                            {t?.initials || "ES"}
                          </button>
                          <div>
                            <b>{t ? t.cn + "框架" : "沙龙主持人"}</b>
                            <small>
                              ROUND 0{m.round} / {m.kind}
                            </small>
                          </div>
                          <span className="message-type">
                            {state.session?.mode === "live"
                              ? "AI 实时推演"
                              : "议题演算"}
                          </span>
                        </div>
                        <p>{m.body}</p>
                      </div>
                    );
                  })}
                  {!messages.length && (
                    <div className="empty small">
                      <Radio size={24} />
                      <p>会场刚刚开启。第一位思想代理正在准备独立判断。</p>
                    </div>
                  )}
                  {filter > 0 && !visible.length && messages.length > 0 && (
                    <div className="empty small">
                      <BookOpen size={23} />
                      <p>第 {filter} 轮尚未开始，沙龙引擎会自行推进至本轮。</p>
                    </div>
                  )}
                </div>
                {state.session?.status === "complete" && (
                  <div className="summary-callout">
                    <span className="section-label">THE TAKEAWAY</span>
                    <h3>
                      今天的讨论已经完成。
                      <br />
                      共识、分歧与待验证条件已进入档案。
                    </h3>
                    <p>明日会场将依据今天的议题投票自动选择主题。</p>
                    <button className="primary" onClick={exportNotes}>
                      <Download size={14} /> 导出完整纪要
                    </button>
                  </div>
                )}
              </article>
              <aside className="evidence">
                <div className="section-head">
                  <h2>
                    <FileText size={17} /> 本期证据桌
                  </h2>
                  <span>{evidenceSources.length.toString().padStart(2, "0")}</span>
                </div>
                <p className="muted">先看依据，再进入判断。</p>
                {evidenceSources.map((s, i) => (
                  <button
                    className="source"
                    onClick={() => setModal("source-" + i)}
                    key={s.title}
                  >
                    <small>
                      {(i + 1).toString().padStart(2, "0")} / {s.kind}
                    </small>
                    <p>{s.title}</p>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
                <div className="question-box">
                  <MessageSquare size={20} />
                  <h3>让你的问题上桌。</h3>
                  <p>问题按支持数排序，在主持人的下一个节点进入讨论上下文。</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      document
                        .getElementById("questions")
                        ?.scrollIntoView({ behavior: "smooth" });
                      draftRef.current?.focus();
                    }}
                  >
                    参与提问 <ArrowRight size={15} />
                  </button>
                </div>
                <div className="evidence-note">
                  <b>证据边界</b>
                  <p>
                    思想卡来自公开研究。模型模式下，代理仍必须明确标注推断和待验证条件。
                  </p>
                </div>
              </aside>
            </section>
            <section id="questions" className="questions-section">
              <div className="section-label">QUESTIONS FROM THE FLOOR</div>
              <div className="section-head">
                <h2>
                  观众问题池{" "}
                  <span className="count">
                    {state.questions.length.toString().padStart(2, "0")}
                  </span>
                </h2>
                <span>按支持数排序 · 主持节点自动取题</span>
              </div>
              <div className="questions-layout">
                <div>
                  <div className="question-prompt">
                    值得追问：如果技术确实有效，为什么投资者仍可能亏损？
                  </div>
                  {!state.questions.length ? (
                    <p className="empty-question">
                      还没有提问。第一个好问题，往往决定讨论的深度。
                    </p>
                  ) : (
                    state.questions.map((q) => (
                      <div className="question-item" key={q.id}>
                        <button
                          className={"vote-button " + (q.liked ? "voted" : "")}
                          onClick={() => like(q)}
                          aria-label={"支持问题：" + q.body}
                          disabled={!!q.liked}
                        >
                          <ArrowUp size={14} />
                          {q.votes}
                        </button>
                        <div>
                          <p>{q.body}</p>
                          <small>
                            {thinkers.find((t) => t.id === q.target)?.cn ||
                              "主持人"}{" "}
                            ·{" "}
                            {q.status === "included"
                              ? "已进入讨论"
                              : "等待主持节点"}
                          </small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="question-form">
                  <label htmlFor="question-body">
                    你想让哪一个假设接受检验？
                  </label>
                  <textarea
                    id="question-body"
                    ref={draftRef}
                    maxLength={500}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="写下你的问题，建议包含明确的条件或证据…"
                  />
                  <div className="form-bottom">
                    <select
                      aria-label="提问对象"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="host">交给主持人</option>
                      {thinkers.map((t) => (
                        <option key={t.id} value={t.id}>
                          @ {t.cn}框架
                        </option>
                      ))}
                    </select>
                    <span>{question.length}/500</span>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        question.trim().length < 5 ||
                        state.session?.status === "complete"
                      }
                      onClick={submitQuestion}
                    >
                      提交问题 <ArrowRight size={13} />
                    </button>
                  </div>
                  {state.session?.status === "complete" && (
                    <p className="mode-note">
                      本期已经归档，明日新会场开启后可继续提问。
                    </p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
        {tab === "议题广场" && (
          <section className="secondary">
            <div className="eyebrow">THE AGENDA OF TOMORROW</div>
            <h1>
              下一场，<em>由问题开始。</em>
            </h1>
            <p className="intro">
              把有限的票，投给值得被深入讨论的问题。每位成员每天 5
              票，可集中投给同一议题。
            </p>
            <div className="topic-bar">
              <span>
                今日剩余 <strong>{state.remaining}</strong> / 5 票
              </span>
              <span>北京时间 23:55 截止 · 次日会场自动采用最高票议题</span>
            </div>
            <div className="agenda-status">
              <span>
                今日自动采集 · {state.agenda.categories.join(" / ") || "等待来源"}
              </span>
              <span>
                {state.agenda.generationMode.startsWith("free-model")
                  ? "免费模型编辑"
                  : "来源规则编辑"}
              </span>
            </div>
            {state.candidates.map((c, i) => {
              const v = state.votes.find((x) => x.topic === c.id);
              return (
                <article className="topic-card" key={c.id}>
                  <span className="topic-num">0{i + 1}</span>
                  <div>
                    <span className="category">{c.tag}</span>
                    <h2>{c.title}</h2>
                    <p>{c.description}</p>
                    {c.sources[0] && (
                      <a
                        className="topic-source-link"
                        href={c.sources[0].url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        原始线索：{c.sources[0].publisher} <ArrowUpRight size={13} />
                      </a>
                    )}
                    <small>
                      {v?.people || 0} 位参与者 · {v?.votes || 0} 票
                    </small>
                  </div>
                  <button
                    disabled={busy || !state.remaining}
                    className="topic-vote"
                    onClick={() => vote(c.id)}
                  >
                    <ArrowUp size={19} />
                    <strong>{v?.votes || 0}</strong>
                    <span>投一票</span>
                  </button>
                </article>
              );
            })}
            <p className="mode-note">
              今日投票结果将在次日首次打开会场时冻结并选题；无投票时使用编辑部候选议题。
            </p>
          </section>
        )}
        {tab === "思想家库" && (
          <section className="secondary">
            <div className="eyebrow">A LIBRARY OF ECONOMIC LENSES</div>
            <h1>
              不止于观点。
              <br />
              <em>看见观点背后的机制。</em>
            </h1>
            <p className="intro">
              五张研究框架卡，一组互相约束的提问方式。所有代理均为思想模型，不是本人数字分身。
            </p>
            <label className="search">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索经济学家、理论或机制"
                aria-label="搜索思想卡"
              />
            </label>
            <div className="library">
              {thinkers
                .filter((t) =>
                  (t.cn + t.name + t.field + t.mechanism)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((t) => (
                  <button
                    className="library-card"
                    key={t.id}
                    onClick={() => setModal(t.id)}
                  >
                    <div className="library-top">
                      <span className="avatar">{t.initials}</span>
                      <small>思想模型 / V1.0</small>
                    </div>
                    <h2>{t.name}</h2>
                    <h3>
                      {t.cn} <span>· {t.field}</span>
                    </h3>
                    <p>{t.mechanism}</p>
                    <div className="card-question">{t.question}</div>
                    <span className="text-button">
                      查看完整思想卡 <ArrowUpRight size={15} />
                    </span>
                  </button>
                ))}
            </div>
            {!thinkers.some((t) =>
              (t.cn + t.name + t.field + t.mechanism)
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <div className="empty">
                <Search size={28} />
                <h3>没有匹配的思想卡</h3>
                <button className="text-button" onClick={() => setQuery("")}>
                  清除搜索
                </button>
              </div>
            )}
          </section>
        )}
        {tab === "模型与赞助" && (
          <section className="secondary funding-page">
            <div className="eyebrow">MODEL RADAR · AUTONOMOUS ROUTING</div>
            <h1>
              先寻找免费算力，
              <br />
              <em>再决定今天由谁思考。</em>
            </h1>
            <p className="intro">
              模型雷达读取主流供应商的官方目录与免费层，优先调用已配置的免费通道；遇到限流或故障会自动切换。免费 API
              仍需注册密钥，密钥只保存在服务端。
            </p>
            <div className="radar-head">
              <div>
                <span className={"radar-signal " + (radar?.catalogOnline ? "online" : "")} />
                <b>
                  {radarLoading
                    ? "正在扫描免费模型目录"
                    : radar?.catalogOnline
                      ? `已发现 ${radar.freeModels.length} 个当前免费候选`
                      : "目录暂时离线，保留供应商规则"}
                </b>
                <small>
                  {radar?.active
                    ? `当前首选：${radar.active.label} / ${radar.active.model}`
                    : "尚未配置密钥，沙龙继续以议题演算引擎运行"}
                </small>
              </div>
              <button
                className="text-button radar-refresh"
                onClick={() => {
                  setRadarLoading(true);
                  void loadRadar(true).catch((e) => {
                    setRadarLoading(false);
                    setError((e as Error).message);
                  });
                }}
                disabled={radarLoading}
              >
                <Sparkles size={14} /> 重新扫描
              </button>
            </div>
            <div className="provider-grid">
              {(radar?.providers || []).map((provider) => (
                <article className={provider.active ? "provider-card active" : "provider-card"} key={provider.id}>
                  <div className="provider-top">
                    <b>{provider.label}</b>
                    <span className={provider.configured ? "configured" : "needs-key"}>
                      {provider.active ? "正在使用" : provider.configured ? "已接入" : "待放入密钥"}
                    </span>
                  </div>
                  <h2>{provider.offer}</h2>
                  <p>{provider.detail}</p>
                  <a href={provider.source} target="_blank" rel="noreferrer">
                    查看官方规则 <ArrowUpRight size={13} />
                  </a>
                </article>
              ))}
              {radarLoading &&
                Array.from({ length: 4 }).map((_, index) => (
                  <div className="provider-card provider-loading" key={index} aria-hidden="true" />
                ))}
            </div>
            {radar && radar.freeModels.length > 0 && (
              <div className="free-models">
                <div className="section-head">
                  <h2>OpenRouter 当前免费候选</h2>
                  <span>实时目录 · 免费状态可能变化</span>
                </div>
                <div className="model-strip">
                  {radar.freeModels.map((model) => (
                    <article key={model.id}>
                      <small>{model.id.split("/")[0].toUpperCase()}</small>
                      <b>{model.name}</b>
                      <span>
                        {contextAmount(model.context)} 上下文
                        {model.structured ? " · 结构化输出" : ""}
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            )}
            <div className="routing-policy">
              <span>自动路由顺序</span>
              {(radar?.policy || ["寻找免费通道", "检查可用性", "生成整轮", "故障时切换"]).map(
                (item, index) => (
                  <div key={item}>
                    <strong>0{index + 1}</strong>
                    {item}
                  </div>
                ),
              )}
            </div>
            <div className="funding-divider">
              <span>A COMMON POOL FOR PUBLIC REASONING</span>
              <h2>免费额度用尽后，由公共资金池继续支持讨论。</h2>
              <p>
                资金记录与实际 Token 消耗分开记账；系统只有在免费通道不可用时才进入付费兜底。
              </p>
            </div>
            <div className="funding-stats">
              <article>
                <span>已记录支持</span>
                <strong>{state.funding.supporters}</strong>
                <small>笔已确认赞助</small>
              </article>
              <article>
                <span>模型批次</span>
                <strong>{state.funding.usage.calls}</strong>
                <small>每轮一次，而非逐人调用</small>
              </article>
              <article>
                <span>实际 Token</span>
                <strong>
                  {tokenAmount(
                    state.funding.usage.input_tokens +
                      state.funding.usage.output_tokens,
                  )}
                </strong>
                <small>
                  其中缓存 {tokenAmount(state.funding.usage.cached_tokens)}
                </small>
              </article>
              <article>
                <span>估算模型成本</span>
                <strong>
                  {modelCost(state.funding.usage.estimated_microusd)}
                </strong>
                <small>依据当前模型单价估算</small>
              </article>
            </div>
            <div className="funding-grid">
              <article className="funding-card primary-fund">
                <span className="section-label">SUPPORT THE NEXT SESSION</span>
                <h2>共同支持下一场沙龙</h2>
                <p>
                  支付平台只负责收款；模型密钥始终保存在服务端。支付成功后由签名回调写入公共账本，同一订单不会重复入账。
                </p>
                {state.funding.totals.length > 0 && (
                  <div className="funding-totals">
                    {state.funding.totals.map((item) => (
                      <span key={item.currency}>
                        {fundingAmount(item.currency, Number(item.amount))}
                      </span>
                    ))}
                  </div>
                )}
                {state.funding.paymentReady && state.funding.paymentUrl ? (
                  <a
                    className="primary funding-link"
                    href={state.funding.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    赞助公共沙龙 <ArrowUpRight size={15} />
                  </a>
                ) : (
                  <button className="primary" disabled>
                    支付通道待配置
                  </button>
                )}
                <small>
                  当前页面先展示透明账本。配置商户支付链接与回调密钥后，按钮会自动开放。
                </small>
              </article>
              <article className="funding-card">
                <span className="section-label">HOW THE ENGINE SPENDS</span>
                <h2>三次调用，完成一天讨论</h2>
                <ol className="phase-list">
                  {state.engine.phases.map((time, index) => (
                    <li key={time}>
                      <span>{time}</span>
                      <div>
                        <b>第 {index + 1} 轮</b>
                        <p>
                          {
                            [
                              "生成五种独立判断",
                              "读取最高票问题并交叉质询",
                              "条件更新、共识与分歧归档",
                            ][index]
                          }
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="funding-engine">
                  <span>当前引擎</span>
                  <b>
                    {state.mode === "live"
                      ? `${state.engine.provider} / ${state.engine.model}`
                      : "议题演算 · 等待模型凭据"}
                  </b>
                </div>
              </article>
            </div>
            <div className="funding-rules">
              <span>01 · 服务端密钥</span>
              <span>02 · 支付签名验证</span>
              <span>03 · 订单幂等入账</span>
              <span>04 · 实际 Token 记账</span>
              <span>05 · 无凭据保持演示</span>
            </div>
          </section>
        )}
        {tab === "沙龙档案" && (
          <section className="secondary">
            <div className="eyebrow">THE READING ROOM</div>
            <h1>
              让讨论留下来。
              <br />
              <em>让判断可以被重新检验。</em>
            </h1>
            <p className="intro">
              每天的公共会场自动保存原始发言、观众问题和讨论进度。随时回看，或导出为
              Markdown 纪要。
            </p>
            {!state.sessions.length ? (
              <div className="empty">
                <BookOpen size={35} />
                <h2>第一份档案正在形成。</h2>
                <p>今日沙龙结束后会自动归档。</p>
                <button className="primary" onClick={() => setTab("今日会场")}>
                  回到今日会场 <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              state.sessions.map((s, index) => (
                <button
                  className="archive-item"
                  key={s.id}
                  onClick={() => openSession(s)}
                >
                  <span className="archive-date">
                    {new Date(s.created).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                    <small>
                      {index === 0
                        ? "今日会场"
                        : new Date(s.created).toLocaleTimeString("zh-CN", {
                            timeZone: "Asia/Shanghai",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                    </small>
                  </span>
                  <div>
                    <span className="category">
                      {s.mode === "live" ? "AI 自运转" : "议题演算"} ·{" "}
                      {s.status === "complete" ? "已归档" : "正在进行"}
                    </span>
                    <h2>{s.title}</h2>
                    <p>
                      已完成 {s.turn} / {state.engine.total} 次发言 ·
                      点击回到会场阅读
                    </p>
                  </div>
                  <ArrowUpRight size={22} />
                </button>
              ))
            )}
          </section>
        )}
      </main>
      <footer>
        <span className="footer-brand">ECONOMICS SALON</span>
        <p>基于公开研究构建的思想模型 · 不代表经济学家本人观点 · 非投资建议</p>
        <span>Ideas in dialogue.</span>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            id="salon-dialog"
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="close"
              aria-label="关闭对话框"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {selectedThinker ? (
              <>
                <div className="eyebrow">THOUGHT MODEL · VERSION 1.0</div>
                <h2 id="modal-title">{selectedThinker.name}</h2>
                <p className="modal-sub">
                  {selectedThinker.cn}框架 · {selectedThinker.field}
                </p>
                <dl>
                  <dt>核心机制</dt>
                  <dd>{selectedThinker.mechanism}</dd>
                  <dt>习惯追问</dt>
                  <dd>{selectedThinker.question}</dd>
                  <dt>适用边界</dt>
                  <dd>{selectedThinker.boundary}</dd>
                </dl>
                <a
                  className="primary"
                  href={selectedThinker.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  阅读原始文献 <ArrowUpRight size={14} />
                </a>
                <p className="mode-note">
                  由公开研究整理的教学框架，不代表经济学家本人对当期议题的表态。社区修订与审核将在后续版本开放。
                </p>
              </>
            ) : modal.startsWith("source-") ? (
              (() => {
                const s = evidenceSources[Number(modal.slice(7))];
                return (
                  <>
                    <div className="eyebrow">AT THE EVIDENCE TABLE</div>
                    <h2 id="modal-title">{s.title}</h2>
                    <p className="modal-sub">{s.author}</p>
                    <p>{s.note}</p>
                    <a
                      className="primary"
                      target="_blank"
                      rel="noreferrer"
                      href={s.url}
                    >
                      在原始来源阅读 <ArrowUpRight size={14} />
                    </a>
                  </>
                );
              })()
            ) : modal === "login" ? (
              <>
                <div className="eyebrow">TAKE YOUR SEAT</div>
                <h2 id="modal-title">欢迎来到圆桌。</h2>
                <p>使用平台账户登录，保存你的问题、投票与沙龙档案。</p>
                <a
                  className="primary"
                  href="/signin-with-chatgpt?return_to=/"
                  target="_top"
                >
                  <LogIn size={15} /> 使用 ChatGPT 登录
                </a>
                <div className="login-note">
                  <b>自治会场说明</b>
                  <p>
                    每日会场自动建立并持续推进。当前未配置模型凭据，因此使用议题驱动的规则引擎；启用模型后，思想代理会按蒸馏卡即时生成。
                  </p>
                </div>
              </>
            ) : modal === "account" ? (
              <>
                <div className="eyebrow">YOUR SEAT AT THE TABLE</div>
                <h2 id="modal-title">我的席位</h2>
                <p className="account-name">{state.user?.name}</p>
                <dl>
                  <dt>今日投票余额</dt>
                  <dd>{state.remaining} / 5 票</dd>
                  <dt>已保存会场</dt>
                  <dd>{state.sessions.length} 场（最近 30 场）</dd>
                  <dt>当前模式</dt>
                  <dd>
                    {state.mode === "demo" ? "议题演算引擎" : "AI 自运转沙龙"}
                  </dd>
                </dl>
                <a
                  className="text-button"
                  href="/signout-with-chatgpt?return_to=/"
                  target="_top"
                >
                  退出当前账户 →
                </a>
              </>
            ) : (
              <>
                <div className="eyebrow">OUR METHOD</div>
                <h2 id="modal-title">让理论彼此约束。</h2>
                <dl>
                  <dt>01 / 独立判断</dt>
                  <dd>先呈现各框架独立的机制、假设和可验证条件。</dd>
                  <dt>02 / 交叉质询</dt>
                  <dd>直接回应另一个框架的关键假设，而不是重复自己的观点。</dd>
                  <dt>03 / 证据更新</dt>
                  <dd>引入明确标注的假设情景，观察判断如何变化。</dd>
                  <dt>自治协议</dt>
                  <dd>
                    每日会场自动选题，代理逐次发言，主持节点自动接入最高票问题，三轮结束后归档。议题演算引擎会按当日主题生成对应冲突与证据链；模型模式按同一协议即时生成。
                  </dd>
                </dl>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
