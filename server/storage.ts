import { type Incident, type InsertIncident, type AiSuggestion, type InsertAiSuggestion, type Audit, type InsertAudit } from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private incidents: Map<number, Incident> = new Map();
  private aiSuggestions: Map<number, AiSuggestion> = new Map();
  private audits: Map<number, Audit> = new Map();
  private incidentIdCounter = 1;
  private aiSuggestionIdCounter = 1;
  private auditIdCounter = 1;

  async createIncident(insertIncident: InsertIncident): Promise<Incident> {
    const id = this.incidentIdCounter++;
    const now = new Date();
    const incident: Incident = {
      id,
      ...insertIncident,
      address: insertIncident.address || null,
      createdAt: now,
      updatedAt: now,
    };
    this.incidents.set(id, incident);
    return incident;
  }

  async getIncident(id: number): Promise<Incident | undefined> {
    return this.incidents.get(id);
  }

  async getIncidents(filters?: { severity?: string; category?: string }): Promise<Incident[]> {
    let incidents = Array.from(this.incidents.values());
    
    if (filters?.severity) {
      incidents = incidents.filter(i => i.severity === filters.severity);
    }
    if (filters?.category) {
      incidents = incidents.filter(i => i.category === filters.category);
    }
    
    // Sort by created date descending
    return incidents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createAiSuggestion(insertSuggestion: InsertAiSuggestion): Promise<AiSuggestion> {
    const id = this.aiSuggestionIdCounter++;
    const suggestion: AiSuggestion = {
      id,
      ...insertSuggestion,
      createdAt: new Date(),
    };
    this.aiSuggestions.set(id, suggestion);
    return suggestion;
  }

  async getAiSuggestionsByIncident(incidentId: number): Promise<AiSuggestion[]> {
    return Array.from(this.aiSuggestions.values())
      .filter(s => s.incidentId === incidentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createAudit(insertAudit: InsertAudit): Promise<Audit> {
    const id = this.auditIdCounter++;
    const audit: Audit = {
      id,
      ...insertAudit,
      createdAt: new Date(),
    };
    this.audits.set(id, audit);
    return audit;
  }

  async getAuditsByIncident(incidentId: number): Promise<Audit[]> {
    return Array.from(this.audits.values())
      .filter(a => a.incidentId === incidentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export const storage = new MemStorage();
