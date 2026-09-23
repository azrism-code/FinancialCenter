import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const portfolios = sqliteTable("portfolios", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
