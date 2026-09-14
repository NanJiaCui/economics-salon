ALTER TABLE `sessions` ADD `topic_context` text;
--> statement-breakpoint
CREATE TABLE `agenda_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`category` text NOT NULL,
	`tag` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`tension` text NOT NULL,
	`sources_json` text NOT NULL,
	`generation_mode` text NOT NULL,
	`freshness_score` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agenda_day_score` ON `agenda_topics` (`day`,`freshness_score`);
