import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(), // YouTube video ID
  title: text('title').notNull(),
  channel: text('channel').notNull().default(''),
  duration: integer('duration').notNull().default(0), // seconds
  filePath: text('file_path').notNull(),
  fileExt: text('file_ext').notNull().default('m4a'),
  thumbnailUrl: text('thumbnail_url').notNull().default(''),
  downloadedAt: text('downloaded_at').notNull(),
  fileSize: integer('file_size').notNull().default(0),
});

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const playlistTracks = sqliteTable('playlist_tracks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playlistId: integer('playlist_id')
    .notNull()
    .references(() => playlists.id, { onDelete: 'cascade' }),
  trackId: text('track_id')
    .notNull()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  addedAt: text('added_at').notNull(),
});

export const tracksRelations = relations(tracks, ({ many }) => ({
  playlistTracks: many(playlistTracks),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  playlistTracks: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}));

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type PlaylistTrack = typeof playlistTracks.$inferSelect;
