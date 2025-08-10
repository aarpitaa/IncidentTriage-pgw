import { type Incident, type InsertIncident, type AiSuggestion, type InsertAiSuggestion, type Audit, type InsertAudit, incidents, aiSuggestions, audits } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc, or, ilike, sql, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Incidents
  createIncident(incident: InsertIncident): Promise<Incident>;
  getIncident(id: number): Promise<Incident | undefined>;
  getIncidents(filters?: { 
    severity?: string; 
    category?: string; 
    search?: string;
    sortBy?: string;
    sortDir?: string;
  }): Promise<Incident[]>;
  
  // AI Suggestions
  createAiSuggestion(suggestion: InsertAiSuggestion): Promise<AiSuggestion>;
  getAiSuggestionsByIncident(incidentId: number): Promise<AiSuggestion[]>;
  
  // Audits
  createAudit(audit: InsertAudit): Promise<Audit>;
  getAuditsByIncident(incidentId: number): Promise<Audit[]>;
  
  // Analytics
  getAnalytics(fromDate: Date, toDate: Date): Promise<any>;
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

  async getIncidents(filters?: { 
    severity?: string; 
    category?: string; 
    search?: string;
    sortBy?: string;
    sortDir?: string;
  }): Promise<Incident[]> {
    let query = db.select().from(incidents);
    
    // Build WHERE conditions
    const conditions = [];
    
    if (filters?.severity) {
      conditions.push(eq(incidents.severity, filters.severity));
    }
    if (filters?.category) {
      conditions.push(eq(incidents.category, filters.category));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(or(
        ilike(incidents.address, searchTerm),
        ilike(incidents.description, searchTerm),
        ilike(incidents.summary, searchTerm)
      ));
    }
    
    if (conditions.length === 1) {
      query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions));
    }
    
    // Apply sorting
    const sortColumn = filters?.sortBy === 'updated_at' ? incidents.updatedAt : incidents.createdAt;
    const sortDirection = filters?.sortDir === 'asc' ? asc : desc;
    
    const results = await query.orderBy(sortDirection(sortColumn));
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

  async getAnalytics(fromDate: Date, toDate: Date) {
    // Get total incidents in window
    const totalIncidents = await db.select({ count: sql<number>`count(*)` })
      .from(incidents)
      .where(and(
        gte(incidents.createdAt, fromDate),
        lte(incidents.createdAt, toDate)
      ));

    // Get incidents that have been audited
    const auditedIncidents = await db.select({ count: sql<number>`count(distinct ${incidents.id})` })
      .from(incidents)
      .innerJoin(audits, eq(audits.incidentId, incidents.id))
      .where(and(
        gte(incidents.createdAt, fromDate),
        lte(incidents.createdAt, toDate)
      ));

    // Get by severity
    const bySeverity = await db.select({
      severity: incidents.severity,
      count: sql<number>`count(*)`
    })
    .from(incidents)
    .where(and(
      gte(incidents.createdAt, fromDate),
      lte(incidents.createdAt, toDate)
    ))
    .groupBy(incidents.severity);

    // Get by category
    const byCategory = await db.select({
      category: incidents.category,
      count: sql<number>`count(*)`
    })
    .from(incidents)
    .where(and(
      gte(incidents.createdAt, fromDate),
      lte(incidents.createdAt, toDate)
    ))
    .groupBy(incidents.category);

    // Get by week
    const byWeek = await db.select({
      weekStart: sql<string>`to_char(date_trunc('week', ${incidents.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`
    })
    .from(incidents)
    .where(and(
      gte(incidents.createdAt, fromDate),
      lte(incidents.createdAt, toDate)
    ))
    .groupBy(sql`date_trunc('week', ${incidents.createdAt})`)
    .orderBy(sql`date_trunc('week', ${incidents.createdAt})`);

    // Get average changed fields
    const avgChangedFields = await db.select({
      avg: sql<number>`coalesce(avg(json_array_length(${audits.changedFieldsJson}::json)), 0)`
    })
    .from(audits)
    .innerJoin(incidents, eq(audits.incidentId, incidents.id))
    .where(and(
      gte(incidents.createdAt, fromDate),
      lte(incidents.createdAt, toDate)
    ));

    return {
      totals: {
        incidents: totalIncidents[0]?.count || 0,
        audited: auditedIncidents[0]?.count || 0
      },
      bySeverity: bySeverity.map(row => ({ severity: row.severity, count: row.count })),
      byCategory: byCategory.map(row => ({ category: row.category, count: row.count })),
      byWeek: byWeek.map(row => ({ weekStart: row.weekStart, count: row.count })),
      avgChangedFields: Math.round((avgChangedFields[0]?.avg || 0) * 100) / 100
    };
  }
}

export const storage = new DatabaseStorage();
