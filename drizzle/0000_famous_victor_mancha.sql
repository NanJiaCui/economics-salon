CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`owner` text NOT NULL,
	FOREIGN KEY (`question`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_likes_question_owner` ON `likes` (`question`,`owner`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`round` integer NOT NULL,
	`speaker` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_messages_session_created` ON `messages` (`session`,`created`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`target` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`session`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_questions_session_created` ON `questions` (`session`,`created`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_owner_created` ON `sessions` (`owner`,`created`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`day` text NOT NULL,
	`topic` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_votes_owner_day` ON `votes` (`owner`,`day`);--> statement-breakpoint
CREATE INDEX `idx_votes_day_topic` ON `votes` (`day`,`topic`);