CREATE TABLE `eq_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`bands_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eq_presets_name_unique` ON `eq_presets` (`name`);
--> statement-breakpoint
INSERT INTO `eq_presets` (`name`, `bands_json`, `created_at`) VALUES
  ('Flat',       '[{"freq":60,"label":"Bass","gain":0},{"freq":200,"label":"Low","gain":0},{"freq":800,"label":"Mid","gain":0},{"freq":3000,"label":"High","gain":0},{"freq":12000,"label":"Treble","gain":0}]', '2026-03-06T00:00:00.000Z'),
  ('Bass Boost', '[{"freq":60,"label":"Bass","gain":6},{"freq":200,"label":"Low","gain":4},{"freq":800,"label":"Mid","gain":0},{"freq":3000,"label":"High","gain":-2},{"freq":12000,"label":"Treble","gain":0}]', '2026-03-06T00:00:00.001Z'),
  ('Bright',     '[{"freq":60,"label":"Bass","gain":0},{"freq":200,"label":"Low","gain":-2},{"freq":800,"label":"Mid","gain":2},{"freq":3000,"label":"High","gain":4},{"freq":12000,"label":"Treble","gain":6}]', '2026-03-06T00:00:00.002Z');
