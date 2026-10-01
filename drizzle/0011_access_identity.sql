DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `setup_tokens`;--> statement-breakpoint
ALTER TABLE `users` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_hash`;