CREATE TABLE `funding_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`supporter` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_funding_provider_event` ON `funding_events` (`provider`,`provider_event`);--> statement-breakpoint
CREATE INDEX `idx_funding_status_created` ON `funding_events` (`status`,`created`);--> statement-breakpoint
CREATE TABLE `turn_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`position` integer NOT NULL,
	`round` integer NOT NULL,
	`speaker` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_turn_queue_session_position` ON `turn_queue` (`session`,`position`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`round` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_microusd` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_usage_session_created` ON `usage_events` (`session`,`created`);