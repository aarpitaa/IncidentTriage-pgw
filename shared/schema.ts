import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const incidents = pgTable("incidents", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  address: text("address"),
  description: text("description").notNull(),
  category: text("category").notNull(), // Leak, Odor, Outage, Billing, Meter, Other
  severity: text("severity").notNull(), // Low, Medium, High
  summary: text("summary").notNull(),
  nextStepsJson: text("next_steps_json").notNull(), // JSON array of strings
  customerMessage: text("customer_message").notNull(),
  lat: text("lat"), // Latitude for mapping
  lng: text("lng"), // Longitude for mapping
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiSuggestions = pgTable("ai_suggestions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  incidentId: integer("incident_id").references(() => incidents.id).notNull(),
  rawJson: text("raw_json").notNull(), // Original AI suggestion
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const audits = pgTable("audits", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  incidentId: integer("incident_id").references(() => incidents.id).notNull(),
  beforeJson: text("before_json").notNull(), // Values before save
  afterJson: text("after_json").notNull(), // Values after save
  changedFieldsJson: text("changed_fields_json").notNull(), // List of changed field names
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod schemas
export const categoryEnum = z.enum(["Leak", "Odor", "Outage", "Billing", "Meter", "Other"]);
export const severityEnum = z.enum(["Low", "Medium", "High"]);

export const insertIncidentSchema = createInsertSchema(incidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: categoryEnum,
  severity: severityEnum,
});

export const insertAiSuggestionSchema = createInsertSchema(aiSuggestions).omit({
  id: true,
  createdAt: true,
});

export const insertAuditSchema = createInsertSchema(audits).omit({
  id: true,
  createdAt: true,
});

// Enrich request/response schemas
export const enrichRequestSchema = z.object({
  address: z.string().optional(),
  description: z.string().min(1),
});

export const enrichResponseSchema = z.object({
  category: categoryEnum,
  severity: severityEnum,
  summary: z.string().max(600), // ~120 words
  nextSteps: z.array(z.string()),
  customerMessage: z.string().max(600), // ~120 words
});

// Types
export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type AiSuggestion = typeof aiSuggestions.$inferSelect;
export type InsertAiSuggestion = z.infer<typeof insertAiSuggestionSchema>;
export type Audit = typeof audits.$inferSelect;
export type InsertAudit = z.infer<typeof insertAuditSchema>;
export type EnrichRequest = z.infer<typeof enrichRequestSchema>;
export type EnrichResponse = z.infer<typeof enrichResponseSchema>;
