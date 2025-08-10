import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { createAIService } from "./services/ai";
import { enrichRequestSchema, insertIncidentSchema, categoryEnum, severityEnum } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const aiService = createAIService();

  // Build info
  const BUILD_SHA = process.env.REPL_SLUG || process.env.REPLIT_SLUG || 'local-dev';

  // Rate limiting for AI enrichment
  const enrichRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute per IP
    message: { error: "Too many AI enrichment requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

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
    const useOpenAI = process.env.USE_OPENAI === 'true' && !!process.env.OPENAI_API_KEY;
    res.json({ 
      ok: true,
      time: new Date().toISOString(),
      mode: useOpenAI ? "OpenAI" : "DummyAI",
      model: process.env.OPENAI_MODEL || null,
      db: "postgres",
      build: BUILD_SHA
    });
  });

  app.post("/api/enrich", enrichRateLimit, async (req, res) => {
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
      const { severity, category, q, sort, dir } = req.query;
      const filters: { 
        severity?: string; 
        category?: string; 
        search?: string;
        sortBy?: string;
        sortDir?: string;
      } = {};
      
      if (severity && typeof severity === 'string') {
        filters.severity = severity;
      }
      if (category && typeof category === 'string') {
        filters.category = category;
      }
      if (q && typeof q === 'string') {
        filters.search = q;
      }
      if (sort && typeof sort === 'string' && ['created_at', 'updated_at'].includes(sort)) {
        filters.sortBy = sort;
      }
      if (dir && typeof dir === 'string' && ['asc', 'desc'].includes(dir)) {
        filters.sortDir = dir;
      }

      const incidents = await storage.getIncidents(filters);
      res.json(incidents);
    } catch (error) {
      console.error("Get incidents error:", error);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  app.get("/api/incidents/export.csv", async (req, res) => {
    try {
      const incidents = await storage.getIncidents();
      
      // CSV headers
      const headers = ["id", "created_at", "address", "category", "severity", "summary", "next_steps", "customer_message"];
      
      // Convert incidents to CSV rows
      const csvRows = incidents.map(incident => {
        const nextSteps = JSON.parse(incident.nextStepsJson).join(" | ");
        return [
          incident.id,
          incident.createdAt.toISOString(),
          incident.address || "",
          incident.category,
          incident.severity,
          `"${incident.summary.replace(/"/g, '""')}"`, // Escape quotes in CSV
          `"${nextSteps.replace(/"/g, '""')}"`,
          `"${incident.customerMessage.replace(/"/g, '""')}"`,
        ].join(",");
      });

      const csvContent = [headers.join(","), ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="incidents.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({ error: "Failed to export incidents" });
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

  app.get("/api/incidents/:id/export.json", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const incident = await storage.getIncident(id);
      
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const aiSuggestions = await storage.getAiSuggestionsByIncident(id);
      const audits = await storage.getAuditsByIncident(id);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="incident-${id}.json"`);
      res.json({
        incident,
        aiSuggestions,
        audits,
      });
    } catch (error) {
      console.error("Export incident error:", error);
      res.status(500).json({ error: "Failed to export incident" });
    }
  });

  app.post("/api/incidents/import", async (req, res) => {
    try {
      const incidents = req.body;
      if (!Array.isArray(incidents)) {
        return res.status(400).json({ error: "Expected array of incidents" });
      }

      let insertedCount = 0;
      let skippedCount = 0;

      for (const incidentData of incidents) {
        try {
          // Skip if incident with same ID already exists
          if (incidentData.incident?.id) {
            const existing = await storage.getIncident(incidentData.incident.id);
            if (existing) {
              skippedCount++;
              continue;
            }
          }

          // Insert incident
          const { id, createdAt, updatedAt, ...insertData } = incidentData.incident;
          const newIncident = await storage.createIncident(insertData);

          // Insert AI suggestions
          if (incidentData.aiSuggestions?.length) {
            for (const suggestion of incidentData.aiSuggestions) {
              const { id: sugId, incidentId, createdAt, ...sugData } = suggestion;
              await storage.createAiSuggestion({
                ...sugData,
                incidentId: newIncident.id,
              });
            }
          }

          // Insert audits
          if (incidentData.audits?.length) {
            for (const audit of incidentData.audits) {
              const { id: auditId, incidentId, createdAt, ...auditData } = audit;
              await storage.createAudit({
                ...auditData,
                incidentId: newIncident.id,
              });
            }
          }

          insertedCount++;
        } catch (error) {
          console.error("Failed to import incident:", error);
          skippedCount++;
        }
      }

      res.json({ 
        message: `Import completed`,
        inserted: insertedCount,
        skipped: skippedCount,
        total: incidents.length
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ error: "Failed to import incidents" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
