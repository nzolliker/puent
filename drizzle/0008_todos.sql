CREATE TABLE `todos` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
