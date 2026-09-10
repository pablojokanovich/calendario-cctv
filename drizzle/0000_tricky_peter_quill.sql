CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`event_name` text NOT NULL,
	`location` text NOT NULL,
	`setup_date` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`phase` text NOT NULL,
	`color` text NOT NULL,
	`assignments` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
