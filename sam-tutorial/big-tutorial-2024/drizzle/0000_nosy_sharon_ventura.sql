CREATE TABLE `expenses` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`title` text NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
