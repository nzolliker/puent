CREATE TABLE `waterPlants` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` text,
	`date` date,
	CONSTRAINT `waterPlants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `created_at` timestamp DEFAULT (now());