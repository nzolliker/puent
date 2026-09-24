CREATE TABLE `albums` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `albums_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`album_id` bigint unsigned,
	`storage_key` varchar(64) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`bytes` int NOT NULL,
	`caption` text,
	`taken_at` date,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `photos_id` PRIMARY KEY(`id`),
	CONSTRAINT `photos_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
ALTER TABLE `photos` ADD CONSTRAINT `photos_album_id_albums_id_fk` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE set null ON UPDATE no action;