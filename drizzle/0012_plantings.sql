CREATE TABLE `plantings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`bed_key` varchar(40) NOT NULL,
	`cells` json NOT NULL,
	`crop` varchar(120) NOT NULL,
	`note` text,
	`planted_at` date NOT NULL,
	`removed_at` date,
	`photo_id` bigint unsigned,
	`created_by` text,
	`user_id` bigint unsigned,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `plantings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `plantings` ADD CONSTRAINT `plantings_photo_id_photos_id_fk` FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plantings` ADD CONSTRAINT `plantings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;