import { sql } from "drizzle-orm";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  eventName: text("event_name").notNull(),
  location: text("location").notNull(),
  setupDate: text("setup_date").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  phase: text("phase").notNull(),
  color: text("color").notNull(),
  assignments: text("assignments").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const serviceOrders = pgTable("event_service_orders", {
  eventId: integer("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  content: text("content").notNull(),
  updatedAt: text("updated_at").notNull(),
});
