CREATE TABLE `analyses` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`lines` text NOT NULL,
	`priority` integer NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_queue_idx` ON `jobs` (`status`,`priority`,`updated_at`);