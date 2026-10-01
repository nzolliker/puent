CREATE TABLE `weatherDays` (
	`date` date NOT NULL,
	`precip_mm` real NOT NULL,
	`source` enum('measured','forecast') NOT NULL,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weatherDays_date` PRIMARY KEY(`date`)
);
