import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, doublePrecision } from "drizzle-orm/pg-core";
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

// Risk Map Simulator tables
export const riskIncidents = pgTable("risk_incidents", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(), // High|Medium|Low
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

export const riskRepairs = pgTable("risk_repairs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  status: text("status").notNull(), // Open|InProgress|Closed
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const riskPipelines = pgTable("risk_pipelines", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  pathGeojson: jsonb("path_geojson").notNull(), // LineString coordinates
  installYear: integer("install_year").notNull(),
  material: text("material").notNull(),
});

export const riskWeather = pgTable("risk_weather", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  tempC: doublePrecision("temp_c"),
  windKph: doublePrecision("wind_kph"),
  precipMm: doublePrecision("precip_mm"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
});

// Zod schemas
export const categoryEnum = z.enum(["Leak", "Odor", "Outage", "Billing", "Meter", "Other"]);
export const severityEnum = z.enum(["Low", "Medium", "High"]);
export const repairStatusEnum = z.enum(["Open", "InProgress", "Closed"]);

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

// Risk Map insert schemas
export const insertRiskIncidentSchema = createInsertSchema(riskIncidents).omit({
  id: true,
}).extend({
  severity: severityEnum,
});

export const insertRiskRepairSchema = createInsertSchema(riskRepairs).omit({
  id: true,
}).extend({
  status: repairStatusEnum,
});

export const insertRiskPipelineSchema = createInsertSchema(riskPipelines).omit({
  id: true,
});

export const insertRiskWeatherSchema = createInsertSchema(riskWeather).omit({
  id: true,
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

// Risk Map types
export type RiskIncident = typeof riskIncidents.$inferSelect;
export type InsertRiskIncident = z.infer<typeof insertRiskIncidentSchema>;
export type RiskRepair = typeof riskRepairs.$inferSelect;
export type InsertRiskRepair = z.infer<typeof insertRiskRepairSchema>;
export type RiskPipeline = typeof riskPipelines.$inferSelect;
export type InsertRiskPipeline = z.infer<typeof insertRiskPipelineSchema>;
export type RiskWeather = typeof riskWeather.$inferSelect;
export type InsertRiskWeather = z.infer<typeof insertRiskWeatherSchema>;
