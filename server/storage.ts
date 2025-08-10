import { type Incident, type InsertIncident, type AiSuggestion, type InsertAiSuggestion, type Audit, type InsertAudit, incidents, aiSuggestions, audits } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Incidents
  createIncident(incident: InsertIncident): Promise<Incident>;
  getIncident(id: number): Promise<Incident | undefined>;
  getIncidents(filters?: { severity?: string; category?: string }): Promise<Incident[]>;
  
  // AI Suggestions
  createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion>;
  getAiSuggestionsByIncident(incidentId: number): Promise<AiSuggestion[]>;
  
  // Audits
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAuditsByIncident(incidentId: number): Promise<Audit[]>;
}



export class DatabaseStorage implements IStorage {
  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const [incident] = await db
      .insert(incidents)
      .values({
        ...insertIncident,
        address: insertIncident.address || null,
      })
      .returning();
    return incident;
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, id));
    return incident || undefined;
  }

  async getIncidents(filters?: { severity?: string; category?: string }): Promise<Incident[]> {
    let query = db.select().from(incidents);
    
    if (filters?.severity && filters?.category) {
      query = query.where(and(
        eq(incidents.severity, filters.severity),
        eq(incidents.category, filters.category)
      ));
    } else if (filters?.severity) {
      query = query.where(eq(incidents.severity, filters.severity));
    } else if (filters?.category) {
      query = query.where(eq(incidents.category, filters.category));
    }
    
    const results = await query.orderBy(desc(incidents.createdAt));
    return results;
  }

  async createAiSuggestion(insertSuggestion: InsertAiSuggestion): Promise<AiSuggestion> {
    const [suggestion] = await db
      .insert(aiSuggestions)
      .values(insertSuggestion)
      .returning();
    return suggestion;
  }

  async getAiSuggestionsByIncident(incidentId: number): Promise<AiSuggestion[]> {
    return await db
      .select()
      .from(aiSuggestions)
      .where(eq(aiSuggestions.incidentId, incidentId))
      .orderBy(desc(aiSuggestions.createdAt));
  }

  async createAudit(insertAudit: InsertAudit): Promise<Audit> {
    const [audit] = await db
      .insert(audits)
      .values(insertAudit)
      .returning();
    return audit;
  }

  async getAuditsByIncident(incidentId: number): Promise<Audit[]> {
    return await db
      .select()
      .from(audits)
      .where(eq(audits.incidentId, incidentId))
      .orderBy(desc(audits.createdAt));
  }
}

export const storage = new DatabaseStorage();
