import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, primaryKey, serial, text } from "drizzle-orm/pg-core";

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

export const eventDocuments = pgTable("event_documents", {
  id: text("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  complete: boolean("complete").notNull().default(false),
});
export const documentChunks = pgTable("event_document_chunks", {
  documentId: text("document_id").notNull().references(() => eventDocuments.id, { onDelete: "cascade" }),
  part: integer("part").notNull(),
  content: text("content").notNull(),
}, table => [primaryKey({ columns: [table.documentId, table.part] })]);

export const eventWorkspaces = pgTable("event_workspaces", {
  eventId: integer("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});
