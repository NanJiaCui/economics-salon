import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    mode: text("mode").notNull(),
    scope: text("scope").notNull().default("personal"),
    topicId: text("topic_id").notNull().default("ai-growth"),
    topicContext: text("topic_context"),
    discussionJson: text("discussion_json"),
    round: integer("round").notNull().default(0),
    turn: integer("turn").notNull().default(0),
    nextAt: integer("next_at").notNull().default(0),
    engineState: text("engine_state").notNull().default("waiting"),
    lastError: text("last_error"),
    status: text("status").notNull().default("ready"),
    created: integer("created").notNull(),
    updated: integer("updated").notNull(),
  },
  (t) => [
    index("idx_sessions_owner_created").on(t.owner, t.created),
    index("idx_sessions_scope_created").on(t.scope, t.created),
  ],
);
export const agendaTopics = sqliteTable(
  "agenda_topics",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    category: text("category").notNull(),
    tag: text("tag").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    tension: text("tension").notNull(),
    sourcesJson: text("sources_json").notNull(),
    generationMode: text("generation_mode").notNull(),
    freshnessScore: integer("freshness_score").notNull().default(0),
    created: integer("created").notNull(),
  },
  (t) => [index("idx_agenda_day_score").on(t.day, t.freshnessScore)],
);
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    session: text("session")
      .notNull()
      .references(() => sessions.id),
    round: integer("round").notNull(),
    speaker: text("speaker").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    metaJson: text("meta_json"),
    created: integer("created").notNull(),
  },
  (t) => [index("idx_messages_session_created").on(t.session, t.created)],
);
export const turnQueue = sqliteTable(
  "turn_queue",
  {
    id: text("id").primaryKey(),
    session: text("session")
      .notNull()
      .references(() => sessions.id),
    position: integer("position").notNull(),
    round: integer("round").notNull(),
    speaker: text("speaker").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [
    uniqueIndex("idx_turn_queue_session_position").on(t.session, t.position),
  ],
);
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    session: text("session")
      .notNull()
      .references(() => sessions.id),
    round: integer("round").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    estimatedMicrousd: integer("estimated_microusd").notNull().default(0),
    created: integer("created").notNull(),
  },
  (t) => [index("idx_usage_session_created").on(t.session, t.created)],
);
export const fundingEvents = sqliteTable(
  "funding_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEvent: text("provider_event").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    supporter: text("supporter"),
    status: text("status").notNull().default("completed"),
    created: integer("created").notNull(),
  },
  (t) => [
    uniqueIndex("idx_funding_provider_event").on(t.provider, t.providerEvent),
    index("idx_funding_status_created").on(t.status, t.created),
  ],
);
export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    session: text("session")
      .notNull()
      .references(() => sessions.id),
    owner: text("owner").notNull(),
    body: text("body").notNull(),
    target: text("target").notNull(),
    status: text("status").notNull().default("queued"),
    created: integer("created").notNull(),
  },
  (t) => [index("idx_questions_session_created").on(t.session, t.created)],
);
export const likes = sqliteTable(
  "likes",
  {
    id: text("id").primaryKey(),
    question: text("question")
      .notNull()
      .references(() => questions.id),
    owner: text("owner").notNull(),
  },
  (t) => [uniqueIndex("idx_likes_question_owner").on(t.question, t.owner)],
);
export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    day: text("day").notNull(),
    topic: text("topic").notNull(),
  },
  (t) => [
    index("idx_votes_owner_day").on(t.owner, t.day),
    index("idx_votes_day_topic").on(t.day, t.topic),
  ],
);
