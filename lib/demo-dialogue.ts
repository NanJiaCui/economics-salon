import { candidates, rounds, thinkers } from "@/lib/content";

export const DEMO_REVISION = "议题生成 V2";

type Lens = { claim: string; test: string; question: string };
type Brief = {
  tension: string;
  scenario: string;
  synthesis: string;
  lenses: Record<string, Lens>;
};

const briefs: Record<string, Brief> = {
  "ai-growth": {
    tension: "资本投入、技术扩散与投资回报可能在不同时间兑现",
    scenario:
      "假设应用收入继续增长，但企业融资利差扩大、算力设备利用率下降。这是用于检验框架的假设，不是实时数据。",
    synthesis:
      "需要分别核验单位算力产出、付费留存、新企业进入、自由现金流、融资期限和设备利用率",
    lenses: {
      bernanke: {
        claim:
          "AI 投资是否演变为宏观风险，取决于项目由短债、抵押融资还是股权和经营现金流支持。估值回落只有经过资产负债表与信贷条件，才会放大为投资收缩。",
        test: "比较债务期限、现金流覆盖率与融资集中度",
        question: "回报预期下修时，哪一段融资链会最先收紧？",
      },
      mundell: {
        claim:
          "算力、芯片和资本跨境配置，使同一项 AI 投资受到利率、汇率与产业政策共同影响。一个经济体的资本热潮，可能伴随另一个经济体的资本流出或成本重估。",
        test: "区分本币与外币融资，并追踪资本流向和汇率敞口",
        question: "看似便宜的跨境资金，在汇率变化后仍然便宜吗？",
      },
      aghion: {
        claim:
          "AI 资本开支只有降低新企业试错与进入成本，才更可能转化为创造性破坏；如果算力、数据和渠道被少数企业锁定，投入增加也可能巩固既有壁垒。",
        test: "观察新企业进入、应用迭代和基础设施开放程度",
        question: "新增算力在支持新应用，还是保护既有平台？",
      },
      shiller: {
        claim:
          "真实技术进步与过度定价可以同时发生。关于通用人工智能的故事会提前改变估值和融资意愿，而现金流兑现速度可能远慢于叙事扩散。",
        test: "把估值隐含增长与付费需求、留存和现金流对照",
        question: "哪一种可观察收入能证明乐观故事正在兑现？",
      },
      solow: {
        claim:
          "服务器和芯片增加首先属于资本深化。要称为生产率革命，还要证明控制资本、劳动与利用率后，单位投入产出持续提高，并处理采用时滞和测量误差。",
        test: "使用同口径单位投入产出与全要素生产率指标",
        question: "新增产出有多少来自更多设备，有多少来自效率？",
      },
    },
  },
  "credit-transition": {
    tension: "降低政策利率不等于企业融资约束和投资需求同步修复",
    scenario:
      "假设政策利率下降，但银行贷款标准仍然收紧、企业订单没有改善、汇率同时承压。这是检验政策传导的假设，不是实时数据。",
    synthesis:
      "需要同时核验贷款标准、信用利差、企业订单、资本开支意向、汇率敞口和新企业融资可得性",
    lenses: {
      bernanke: {
        claim:
          "政策利率下降能否带动投资，要看银行资产负债表、抵押品价值和借款企业净值。如果风险溢价上升得更快，企业实际外部融资成本仍可能不降反升。",
        test: "比较政策利率、贷款利率、信用利差与拒贷率",
        question: "利率下降后，哪类企业仍然拿不到资金？",
      },
      mundell: {
        claim:
          "开放经济中，降息还会改变资本流动和汇率。若资本外流推高进口成本或外币债务负担，国内融资条件的改善可能被汇率渠道部分抵消。",
        test: "区分汇率制度、资本流动程度与企业外币负债",
        question: "货币宽松的收益是否被汇率和资本外流重新分配？",
      },
      aghion: {
        claim:
          "低利率若主要延长低效率存量企业的生存期，却没有改善新进入者融资，可能削弱资源再配置。投资数量回升也不等于创新质量提高。",
        test: "比较存量续贷、新企业融资和高生产率企业投资占比",
        question: "新增信贷支持了进入与创新，还是只推迟退出？",
      },
      shiller: {
        claim:
          "企业会根据对需求和政策持续性的共同叙事决定是否投资。一次降息可能改善情绪，但如果衰退故事更强，等待仍可能成为占优选择。",
        test: "把调查预期、订单和实际资本开支放在同一时间线上",
        question: "企业不投资是因为资金贵，还是因为不相信未来需求？",
      },
      solow: {
        claim:
          "资本成本下降只改变投资门槛，不保证新增资本带来高产出。若需求、组织能力或技术采用受限，更多投资可能表现为闲置产能而非生产率提升。",
        test: "观察资本利用率、边际产出和单位资本形成的新增产出",
        question: "降息带来的投资是否提高了资本的实际使用效率？",
      },
    },
  },
  "global-fragmentation": {
    tension: "供应安全带来的韧性收益，需要与重复建设、保护成本和效率损失一起计算",
    scenario:
      "假设关键零部件交付时间缩短，但本地生产成本上升、库存融资占用增加、新企业进入率下降。这是检验权衡的假设，不是实时数据。",
    synthesis:
      "需要同时核验中断损失、交付时间、单位成本、库存资金占用、进口替代率、新企业进入和消费者价格",
    lenses: {
      bernanke: {
        claim:
          "产业链回流往往要求企业同时建设备用产能和增加库存，这会占用现金流并提高融资需求。韧性投资若依赖短债，在需求回落时可能通过信贷渠道放大压力。",
        test: "比较库存周转、债务期限、备用产能融资与现金流覆盖",
        question: "为韧性付出的资金成本由企业、银行还是财政承担？",
      },
      mundell: {
        claim:
          "回流不会消除国际联系，而会改变贸易、资本与汇率的组合。进口减少可能伴随资本品价格上升、汇率调整和贸易伙伴反应，净收益不能只看国内产能。",
        test: "追踪贸易条件、汇率、跨境资本和投入品来源变化",
        question: "国内增加的一单位安全，会在海外产生多少成本反馈？",
      },
      aghion: {
        claim:
          "回流政策若带来新的供应商、技术路线和可替代性，可能促进创新；若补贴长期锁定既有企业并阻止竞争，则韧性会变成受保护的低效率。",
        test: "观察供应商进入、采购集中度、技术替代和补贴退出条件",
        question: "政策创造了更多可替代供应商，还是更少的受保护企业？",
      },
      shiller: {
        claim:
          "安全与自主的叙事会改变公众对成本的容忍度，但危机记忆衰减后，消费者和投资者可能重新关注价格。政策需要经得住叙事热度变化。",
        test: "比较风险认知、支付意愿、价格变化和实际中断频率",
        question: "人们愿意为供应安全持续支付多高的溢价？",
      },
      solow: {
        claim:
          "重复产能会降低静态生产率，但若它显著减少停工损失，传统利用率指标可能低估韧性价值。关键是把正常时期成本与中断时期避免的损失放在同一口径。",
        test: "用风险调整后的单位产出比较集中供应与多元供应",
        question: "备用产能避免的预期损失，是否超过其长期闲置成本？",
      },
    },
  },
};

function briefFor(topicId: string, title: string) {
  const matched = candidates.find(
    (candidate) => candidate.id === topicId || candidate.title === title,
  );
  return briefs[matched?.id || "ai-growth"];
}

function thinkerName(id: string) {
  return thinkers.find((thinker) => thinker.id === id)?.cn || "主持人";
}

export function generateDemoRound(
  topicId: string,
  title: string,
  round: number,
  question: Record<string, unknown> | null = null,
) {
  const brief = briefFor(topicId, title);
  const planned = rounds[round - 1] || [];
  if (round === 1)
    return planned.map((turn, index) => {
      const lens = brief.lenses[turn.speaker];
      const previous = planned[index - 1];
      const bridge = previous
        ? `承接${thinkerName(previous.speaker)}刚才对“${title}”的判断，我把问题转向${thinkers.find((item) => item.id === turn.speaker)?.field}：`
        : `承接主持人关于“${title}”的设问，我先从${thinkers.find((item) => item.id === turn.speaker)?.field}判断：`;
      return {
        speaker: turn.speaker,
        kind: `${turn.kind} · ${DEMO_REVISION}`,
        body: `${bridge}${lens.claim} 下一步应${lens.test}。留给下一位的问题是：${lens.question}`,
      };
    });
  if (round === 2) {
    const bernanke = brief.lenses.bernanke;
    const aghion = brief.lenses.aghion;
    const shiller = brief.lenses.shiller;
    return [
      {
        speaker: "host",
        kind: `主持人梳理 · ${DEMO_REVISION}`,
        body: `${question ? `观众提出：“${String(question.body || "").slice(0, 220)}”。` : "主持人回看第一轮。"}围绕“${title}”，五种框架已经把分歧收敛到一个核心张力：${brief.tension}。现在请直接指出前一判断遗漏了什么，并给出可改变结论的证据。`,
      },
      {
        speaker: "aghion",
        kind: `质询 · 伯南克框架 · ${DEMO_REVISION}`,
        body: `承接伯南克关于融资传导的判断，我用创新与进入框架追问：稳定融资如果只是维持既有配置，可能压低退出与新进入。${aghion.claim} 因此不能只看信用是否收缩，还要${aghion.test}。伯南克如何区分“保护传导机制”与“保护低效率主体”？`,
      },
      {
        speaker: "bernanke",
        kind: `回应 · 阿吉翁框架 · ${DEMO_REVISION}`,
        body: `承接阿吉翁关于资源再配置的质询，我同意退出本身不等于系统失灵。${bernanke.claim} 我的边界是：只有当单个主体的问题切断其他有价值项目的融资时，才构成需要干预的放大机制。验证上应${bernanke.test}，而不是只统计退出数量。`,
      },
      {
        speaker: "shiller",
        kind: `质询 · 索洛框架 · ${DEMO_REVISION}`,
        body: `承接索洛对效率口径的要求，我补充预期会先于统计结果变化。${shiller.claim} 即使未来效率改善，也不能反推今天支付的价格合理。需要同时${shiller.test}。索洛的指标要出现多久，才足以让市场叙事改变？`,
      },
    ];
  }
  const solow = brief.lenses.solow;
  const bernanke = brief.lenses.bernanke;
  const aghion = brief.lenses.aghion;
  return [
    {
      speaker: "host",
      kind: `假设情景 · 非实际数据 · ${DEMO_REVISION}`,
      body: `承接第二轮的分歧，主持人加入同一组条件：${brief.scenario} 请每个框架说明原判断需要保留、收缩还是推翻。`,
    },
    {
      speaker: "solow",
      kind: `条件更新 · ${DEMO_REVISION}`,
      body: `承接主持人的假设，我会收缩单看成本或投资规模的判断。${solow.claim} 新条件必须放入同一风险调整口径，并${solow.test}；否则“效率提高”与“为风险买保险”会被混为一谈。`,
    },
    {
      speaker: "bernanke",
      kind: `条件更新 · ${DEMO_REVISION}`,
      body: `承接索洛对口径的修正，我保留融资结构可能放大波动的判断，但不会直接升级为危机结论。${bernanke.claim} 在新情景下，应先${bernanke.test}，再判断压力来自项目基本面、流动性还是普遍利率变化。`,
    },
    {
      speaker: "aghion",
      kind: `条件更新 · ${DEMO_REVISION}`,
      body: `承接伯南克对压力来源的区分，我进一步检查竞争结构。${aghion.claim} 如果新条件同时降低进入与替代，我会下调长期收益判断；若${aghion.test}显示竞争增强，则保留创新可能性。`,
    },
    {
      speaker: "host",
      kind: `共识与分歧 · ${DEMO_REVISION}`,
      body: `本期围绕“${title}”形成的共识是：${brief.tension}，任何单一指标都不足以下结论。仍未解决的分歧，是应为潜在长期收益承受多少当前成本。下一场之前，证据桌${brief.synthesis}。以上是议题驱动的框架推演，不是对现实数据的断言。`,
    },
  ];
}
