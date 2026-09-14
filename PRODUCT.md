# Economics Salon V1

## 本期范围

已实现：五张有原始文献链接的思想模型卡、三轮 SSE 教学讨论、平台身份登录、D1 持久化问题/赞同/每日投票/讨论档案、Markdown 纪要、响应式会场。

演示模式下发言预先撰写；观众问题进入下一轮并明确提示未产生定制 AI 答案。没有虚构在线人数、行情、票数、真人观点。第三轮是明确标注的假设情景。源文献为理论依据，不是时点数据。

实际运行使用 ChatGPT 平台身份；Google/GitHub OAuth 未配置。每日投票北京时间 23:55 截止，每日 5 票，允许集中；条件插入防止并发超额。没有承诺或实现午夜自动换题，页面明确说明该功能属于后续社区版。

## 数据与运行

`.openai/hosting.json` 声明 D1 的 DB 绑定；Drizzle schema 和迁移是唯一结构来源。会场与档案按用户隔离，问题在同一会场内排序；当前私有版本不是跨账户公共直播间。写操作验证服务端身份及会场所有权。用户文本经 React 文本节点渲染；SQL 全部参数绑定。

本地开发：npm run dev。数据库结构：npm run db:generate；npm run build 后按 README 的 Wrangler 本地迁移方法应用。API 接口：GET /api/state、POST /api/action、POST /api/discuss。生产部署用 Sites 插件。

## 真实模型与免费路由

模型雷达会读取 OpenRouter 的公开模型目录，展示当前零价格候选，并记录 Gemini、GroqCloud、Cloudflare Workers AI 的官方免费层。通过 Sites 服务端环境变量配置任意一组供应商密钥后，新建会场自动进入真实 AI 模式；密钥不进入客户端。路由优先使用免费通道，出现限流、服务错误或无效输出时切换下一家，所有免费通道失效后才使用 OpenAI 或自定义付费端点。

每轮只调用一次模型生成完整的顺序对话，随后按自治时钟逐条释放。第一轮首位承接主持人，之后每位必须承接已出现的具体主张；后续轮次包含压缩观点账本与最高票问题。输出经结构与长度检查后才入库。中断后可重跑未完成轮次，同一会场条件更新防止重复并发生成。

本次没有供应商密钥，因此生产站仍以明确标注的演示引擎运行，免费模型发现与路由配置界面已经上线。已完成演示档案不会改成 AI 生成。部署为 owner-private 测试版。

## 文档来源

- https://developers.openai.com/api/docs/guides/streaming-responses
- 经济学框架的原始来源见 lib/content.ts 中的各思想卡。
