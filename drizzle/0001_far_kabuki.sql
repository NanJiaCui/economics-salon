ALTER TABLE `sessions` ADD `scope` text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `topic_id` text DEFAULT 'ai-growth' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `turn` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `next_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `engine_state` text DEFAULT 'waiting' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `idx_sessions_scope_created` ON `sessions` (`scope`,`created`);