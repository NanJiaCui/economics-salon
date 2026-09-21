CREATE TABLE `model_route_health` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`retry_at` integer DEFAULT 0 NOT NULL,
	`last_success` integer DEFAULT 0 NOT NULL,
	`last_status` text DEFAULT 'ready' NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL
);
