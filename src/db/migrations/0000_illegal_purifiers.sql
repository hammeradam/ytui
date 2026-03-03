CREATE TABLE `playlist_tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`playlist_id` integer NOT NULL,
	`track_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`file_path` text NOT NULL,
	`file_ext` text DEFAULT 'm4a' NOT NULL,
	`thumbnail_url` text DEFAULT '' NOT NULL,
	`downloaded_at` text NOT NULL,
	`file_size` integer DEFAULT 0 NOT NULL
);
