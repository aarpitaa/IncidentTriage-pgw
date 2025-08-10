import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createAIService } from "./services/ai";
import { enrichRequestSchema, insertIncidentSchema, categoryEnum, severityEnum } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const aiService = createAIService();

  // CORS for frontend
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/enrich", async (req, res) => {
    try {
      const request = enrichRequestSchema.parse(req.body);
      const result = await aiService.enrichIncident(request);
      res.json(result);
    } catch (error) {
      console.error("Enrich error:", error);
      res.status(400).json({ error: "Failed to enrich incident" });
    }
  });

  app.post("/api/incidents", async (req, res) => {
    try {
      const { aiSuggestionRaw, ...incidentData } = req.body;
      
      // Validate incident data
      const validatedData = insertIncidentSchema.parse(incidentData);
      
      // Create incident
      const incident = await storage.createIncident(validatedData);
      
      // If AI suggestion provided, create audit trail
      if (aiSuggestionRaw) {
        try {
          const aiSuggestion = await storage.createAiSuggestion({
            incidentId: incident.id,
            rawJson: JSON.stringify(aiSuggestionRaw),
            model: process.env.USE_OPENAI === "true" ? (process.env.OPENAI_MODEL || "gpt-4o") : "dummy-ai",
            promptVersion: "v1.0",
          });

          // Compare AI suggestion with final values to create audit
          const changedFields = [];
          const beforeData = aiSuggestionRaw;
          const afterData = {
            category: incident.category,
            severity: incident.severity,
            summary: incident.summary,
            nextSteps: JSON.parse(incident.nextStepsJson),
            customerMessage: incident.customerMessage,
          };

          if (beforeData.category !== afterData.category) changedFields.push("category");
          if (beforeData.severity !== afterData.severity) changedFields.push("severity");
          if (beforeData.summary !== afterData.summary) changedFields.push("summary");
          if (JSON.stringify(beforeData.nextSteps) !== JSON.stringify(afterData.nextSteps)) changedFields.push("nextSteps");
          if (beforeData.customerMessage !== afterData.customerMessage) changedFields.push("customerMessage");

          await storage.createAudit({
            incidentId: incident.id,
            beforeJson: JSON.stringify(beforeData),
            afterJson: JSON.stringify(afterData),
            changedFieldsJson: JSON.stringify(changedFields),
          });
        } catch (auditError) {
          console.error("Failed to create audit trail:", auditError);
          // Don't fail the incident creation if audit fails
        }
      }

      res.json(incident);
    } catch (error) {
      console.error("Create incident error:", error);
      res.status(400).json({ error: "Failed to create incident" });
    }
  });

  app.get("/api/incidents", async (req, res) => {
    try {
      const { severity, category } = req.query;
      const filters: { severity?: string; category?: string } = {};
      
      if (severity && typeof severity === 'string') {
        filters.severity = severity;
      }
      if (category && typeof category === 'string') {
        filters.category = category;
      }

      const incidents = await storage.getIncidents(filters);
      res.json(incidents);
    } catch (error) {
      console.error("Get incidents error:", error);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  app.get("/api/incidents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const incident = await storage.getIncident(id);
      
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const aiSuggestions = await storage.getAiSuggestionsByIncident(id);
      const audits = await storage.getAuditsByIncident(id);

      res.json({
        incident,
        aiSuggestions,
        audits,
      });
    } catch (error) {
      console.error("Get incident error:", error);
      res.status(500).json({ error: "Failed to fetch incident" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
