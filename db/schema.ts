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
    created: integer("created").notNull(),
  },
  (t) => [index("idx_messages_session_created").on(t.session, t.created)],
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
