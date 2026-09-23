import { sqliteTable,text,integer,index } from "drizzle-orm/sqlite-core";
export const libraries=sqliteTable("libraries",{owner:text("owner").primaryKey(),data:text("data").notNull(),updated:integer("updated").notNull()});
export const photos=sqliteTable("photos",{id:text("id").primaryKey(),owner:text("owner").notNull(),mime:text("mime").notNull(),created:integer("created").notNull()},t=>[index("photos_owner").on(t.owner)]);
export const shares=sqliteTable("shares",{id:text("id").primaryKey(),owner:text("owner").notNull(),data:text("data").notNull(),created:integer("created").notNull()},t=>[index("shares_owner").on(t.owner)]);
export const rooms=sqliteTable("rooms",{id:text("id").primaryKey(),owner:text("owner").notNull(),data:text("data").notNull(),revision:integer("revision").notNull().default(0),updated:integer("updated").notNull()},t=>[index("rooms_owner").on(t.owner)]);
export const presence=sqliteTable("presence",{id:text("id").primaryKey(),room:text("room").notNull(),seen:integer("seen").notNull()},t=>[index("presence_room_seen").on(t.room,t.seen)]);
export const suggestions=sqliteTable("suggestions",{id:text("id").primaryKey(),room:text("room").notNull(),data:text("data").notNull(),created:integer("created").notNull()},t=>[index("suggestions_room").on(t.room)]);
