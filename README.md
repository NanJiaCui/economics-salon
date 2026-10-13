# 中国经济 AI 沙龙 · China Economics Salon

围绕中国经济最新变化，每天举行一场能接续前文、保留个人判断的 AI 圆桌讨论。沙龙结束后，把真实交锋编辑成一篇有观点、有反方、有来源的媒体文章。

An open-source AI roundtable focused on China's economy. Each speaker reads the persisted conversation, maintains an individual position, and responds to other participants. Each completed salon is edited into a media article with a clear thesis, dissenting arguments, and traceable sources.

[线上体验 / Live salon](https://economics-salon-yfcui.jijicyf.chatgpt.site/) · [源码 / Source](https://github.com/NanJiaCui/economics-salon)

## 当前流程 / How it works

1. 从国家统计局、国家发展改革委和中国新闻网读取近期公开信息；剔除过期、未来日期、非经济与人事广告条目。选题仅使用过去七天的信息，优先近期信号。
2. 依据新近程度、经济影响与多来源关注选择中国经济议题；关注评分是编辑代理指标，并非平台热搜或流量数据。昨日有效投票优先参与选题。
3. 每天北京时间08:30开启一场完整沙龙。主持人开题，五位思想代理提出判断、交叉质询、修订条件，最终主持人收束，共19次发言。三轮连续推进。
4. 每位发言前独立调用模型，输入包含本场所有已保存发言、各人的观点账本、个人修订记录及可回溯的历史未决问题。正文与观点、回应ID、检验条件、判断变化在同一数据库事务中保存。
5. 模型暂不可用时保存进度并等待重试。已配置的真实讨论不会用规则文本假装成功。没有密钥的演示仍清楚标注为规则推演。
6. 完整讨论结束后，AI编辑自动形成约1200至1800字的媒体文章：一个主判断、冲突型开场、机制与影响、最有力反方、后续检验指标、备选标题与原句传播卡。
7. 文章每节必须回溯实际发言；引用来源须已取得原文或摘要。未知来源、虚构发言ID、未获来源支持的定量断言会阻止出稿并进入重试。支持复制及Markdown下载。

The unattended pipeline is: recent China-economy sources → ranked agenda and votes → one continuous 19-turn salon → persisted participant memory → editorial article and archive. The model receives the complete bounded transcript before each contribution. Articles preserve links to actual contributions and sources, and include the strongest counterargument and conditions that would change the thesis.

## 免费模型与运行 / Models and scheduling

- 默认只用免费通道，付费兜底需明确开启 `SALON_ALLOW_PAID_FALLBACK=true`。
- OpenRouter调用前读取当前模型目录，核对所有价格字段为零且只输出文本；排除安全分类器、音乐与专用代码代理。指定模型下架或失效时选择当前可用的免费文本通道。
- 凭据仅保存在 Sites 服务端。正常每日约需要19次发言、1次选题、1次文章请求；输出错误重试或故障切换可能增加次数。免费活动与限额由供应商决定。
- GitHub Actions在08:30唤醒，并在12:17、18:17、23:17恢复中断的发言或文章生成。网页关闭后仍可运行；运行不使用Codex聊天额度。
- 一场中断的中国经济沙龙优先完成再开下一场；会后文章单独持久化、加锁和重试。原有档案不被改写。

All runtime keys remain server secrets. The model Hub verifies current zero pricing and falls back across eligible routes. GitHub Actions runs the salon while the browser is closed, independently of Codex chat usage. Provider availability, free-tier quotas and GitHub schedule timing remain external dependencies.

## 诚实的能力边界 / Limits

这些角色是受公开研究启发的理论框架卡和模型代理，尚不是训练后的专属蒸馏模型，也不代表经济学家本人。来源摘录、模型解释和独立事实核验是不同层次。文章为AI沙龙观察；传播力是编辑目标，平台不保证“爆款”的阅读或转发结果。不提供投资交易建议。

The personas are research-inspired framework agents, not the economists themselves or separately trained distilled models. Source excerpts are attributed statements rather than independent verification. Editorial quality and reach require assessment; no viral outcome is guaranteed.

## 一起完善 / Contribute

希望更多人共同完善这个开放的经济思想空间，沉淀可以被复查、挑战和更新的成果。欢迎通过Issue和Pull Request贡献：

- 增加可靠的中国经济原始来源与可复现的热点筛选；
- 让角色框架更丰富，减少观点同质化，并改善质询与判断修订；
- 增加跨来源核验、事实与推断标注、长期记忆评估；
- 改进文章证据校验、选题表达、语言与传播卡；
- 提供符合使用条件的免费模型通道、无障碍体验和运行可靠性改进。

Help us build a public space where economic ideas can be examined, challenged, and accumulated. Contributions to source quality, persona diversity, evidence verification, memory evaluation, editorial quality, and runtime reliability are welcome through issues and pull requests.

## 本地开发 / Development

Node.js22.13+。保留现有依赖锁文件，安装依赖后运行开发服务：

```sh
npm ci
npm run dev
node tests/discussion.mjs
node tests/china-salon.mjs
npx tsc --noEmit
npm run build
```

数据库为Cloudflare D1，迁移位于 `drizzle/`。新增的 `salon_articles` 保存文章状态、原文指纹与成稿。发布时应用迁移；本地数据库与线上数据库分开。不要把密钥或运行数据提交到Git。

MIT License. 所有讨论原文、文章和来源说明均保留可回溯关系。
