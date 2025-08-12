import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { storage } from "./storage";
import { createAIService } from "./services/ai";
import { enrichRequestSchema, insertIncidentSchema, categoryEnum, severityEnum, incidents, aiSuggestions, audits, riskIncidents, riskRepairs, riskPipelines, riskWeather, type Incident } from "@shared/schema";
import { and, eq, gte, lte, desc, asc, or, ilike, type SQL } from "drizzle-orm";
import { db } from "./db";
import { sanitizePII } from "../shared/pii";
import dayjs from "dayjs";

export async function registerRoutes(app: Express): Promise<Server> {
  const aiService = createAIService();
  
  // Trust proxy for rate limiting in production
  app.set('trust proxy', 1);

  // Build info
  const BUILD_SHA = process.env.REPL_SLUG || process.env.REPLIT_SLUG || 'local-dev';

  // Create temp audio directory
  const audioTempDir = path.join(process.cwd(), 'tmp', 'audio');
  fs.mkdirSync(audioTempDir, { recursive: true });

  // Multer setup for audio uploads
  const upload = multer({ 
    dest: audioTempDir,
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'audio/webm', 
        'audio/wav', 
        'audio/mp3', 
        'audio/mpeg', 
        'audio/ogg',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/x-wav'
      ];
      // Accept any audio format that starts with 'audio/'
      if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid audio format. Please use webm, wav, mp3, or ogg.'));
      }
    }
  });

  // Rate limiting for AI enrichment
  const enrichRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute per IP
    message: { error: "Too many AI enrichment requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !req.ip, // Skip if no IP available
  });

  // Rate limiting for transcription
  const transcribeRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute per IP
    message: { error: "Too many transcription requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !req.ip, // Skip if no IP available
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

  app.get("/api/stats", async (req, res) => {
    try {
      const { from, to } = req.query;
      
      // Default to last 30 days
      const toDate = to ? new Date(to as string) : new Date();
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const window = {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      };

      // Get statistics using storage methods
      const stats = await storage.getAnalytics(fromDate, toDate);
      
      res.json({
        window,
        ...stats
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
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

  // PII Sanitization helper
  function sanitizePII(text: string): string {
    let sanitized = text;
    
    // Email addresses
    sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => {
      const parts = match.split('@');
      if (parts.length === 2) {
        const [user, domain] = parts;
        const domainParts = domain.split('.');
        return `${user[0]}***@***.${domainParts[domainParts.length - 1]}`;
      }
      return match;
    });
    
    // Phone numbers (10-11 digits)
    sanitized = sanitized.replace(/\b(?:\+?1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '(***) ***-****');
    
    // House numbers (3-5 digits at start of address)
    sanitized = sanitized.replace(/\b(\d{3,5})\s+([A-Za-z])/g, (match, digits, rest) => {
      return `${'*'.repeat(digits.length)} ${rest}`;
    });
    
    return sanitized;
  }

  // Transcription endpoint
  app.post("/api/transcribe", transcribeRateLimit, upload.single('file'), async (req, res) => {
    let filePath: string | undefined;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      filePath = req.file.path;
      const useTranscription = process.env.USE_TRANSCRIPTION !== 'false';
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

      // If transcription is disabled or no OpenAI key, return dummy transcript
      if (!useTranscription || !hasOpenAIKey) {
        const dummyTranscripts = [
          "Caller reports strong gas odor in basement at 1422 Pine Street, pilot light out. No visible flame.",
          "Power outage affecting entire neighborhood on Oak Avenue since 2 PM. Multiple customers calling.",
          "Water main break near intersection of 5th and Main. Water pressure very low throughout area.",
          "Billing dispute for account ending in 4567. Customer says meter reading is incorrect.",
          "Gas leak reported outside apartment building on Elm Street. Residents evacuated to safe distance."
        ];
        
        const randomTranscript = dummyTranscripts[Math.floor(Math.random() * dummyTranscripts.length)];
        
        return res.json({
          transcript: randomTranscript,
          confidence: null,
          segments: [],
          mode: "dummy"
        });
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Transcribe audio with OpenAI Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: process.env.TRANSCRIBE_MODEL || 'whisper-1',
        response_format: 'verbose_json' as any,
        language: 'en'
      });

      // Calculate confidence from segments if available (typing issue with segments)
      let confidence = null;
      const segments = (transcription as any).segments || [];
      if (segments && segments.length > 0) {
        const avgLogProb = segments.reduce((sum: number, seg: any) => sum + (seg.avg_logprob || 0), 0) / segments.length;
        confidence = Math.round(100 * Math.exp(avgLogProb));
      }

      res.json({
        transcript: transcription.text,
        confidence,
        segments,
        mode: "openai"
      });

    } catch (error) {
      console.error("Transcription error:", error);
      
      // Handle specific OpenAI errors gracefully
      if (error instanceof Error) {
        // Quota exceeded - provide realistic feedback about actual audio recording
        if (error.message.includes('quota') || error.message.includes('insufficient_quota') || (error as any).status === 429) {
          console.log("OpenAI quota exceeded, providing audio-aware fallback");
          
          // Get file size from the uploaded file
          let fileSizeKB = 0;
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            fileSizeKB = stats.size / 1024;
          }
          
          let transcript: string;
          
          if (fileSizeKB > 5) {
            // Real audio was recorded, acknowledge it
            transcript = `[Audio file recorded: ${fileSizeKB.toFixed(1)}KB] Your voice recording was captured successfully, but OpenAI transcription service quota is exceeded. Please type your description manually or add credits to your OpenAI account.`;
          } else {
            // Very small audio file, likely silent
            transcript = `Small audio file detected (${fileSizeKB.toFixed(1)}KB). Please speak louder and closer to microphone, or type your description manually.`;
          }
          
          return res.json({
            transcript: transcript,
            confidence: null,
            segments: [],
            mode: "quota-exceeded",
            notice: "OpenAI quota exceeded - please add credits to your OpenAI account or type manually"
          });
        }
        
        // Other specific errors
        if (error.message.includes('audio')) {
          return res.status(400).json({ error: "Invalid audio file format" });
        }
        if (error.message.includes('rate limit') && (error as any).status !== 429) {
          return res.status(429).json({ error: "Rate limit exceeded, please try again later" });
        }
      }
      
      // Final fallback - return dummy transcription with error notice
      const fallbackTranscript = "Customer reports utility service issue. Unable to transcribe audio automatically. Please review and edit this description as needed.";
      
      return res.json({
        transcript: fallbackTranscript,
        confidence: null,
        segments: [],
        mode: "error-fallback",
        notice: "Transcription service temporarily unavailable - please edit the description"
      });
    } finally {
      // Clean up temp file
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.warn("Failed to clean up temp file:", cleanupError);
        }
      }
    }
  });

  // PII Sanitization endpoint
  app.post("/api/sanitize", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text is required" });
      }

      const sanitized = sanitizePII(text);
      res.json({ sanitized });
    } catch (error) {
      console.error("Sanitization error:", error);
      res.status(500).json({ error: "Failed to sanitize text" });
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

  // Risk Map Simulator API endpoints
  app.get("/api/riskmap/bounds", (req, res) => {
    res.json({
      bounds: {
        minLat: 39.90,
        maxLat: 40.10,
        minLng: -75.30,
        maxLng: -75.00
      },
      center: { lat: 40.0, lng: -75.15 },
      zoom: 11
    });
  });

  app.get("/api/riskmap/points", async (req, res) => {
    try {
      const { from, to, layers, severity, category } = req.query;
      
      // Parse dates
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();
      
      // Parse layers
      const requestedLayers = layers ? (layers as string).split(',') : ['incidents', 'repairs', 'weather'];
      
      // Parse filters
      const severityFilter = severity ? (severity as string).split(',') : ['High', 'Medium', 'Low'];
      const categoryFilter = category ? (category as string).split(',') : [];
      
      const result: any = {};
      
      // Fetch incidents if requested
      if (requestedLayers.includes('incidents')) {
        const incidents = await db.select().from(riskIncidents)
          .where(and(
            gte(riskIncidents.occurredAt, fromDate),
            lte(riskIncidents.occurredAt, toDate)
          ));
        
        result.incidents = incidents.filter(inc => 
          severityFilter.includes(inc.severity) && 
          (categoryFilter.length === 0 || categoryFilter.includes(inc.category))
        );
      }
      
      // Fetch repairs if requested
      if (requestedLayers.includes('repairs')) {
        result.repairs = await db.select().from(riskRepairs)
          .where(and(
            gte(riskRepairs.openedAt, fromDate),
            lte(riskRepairs.openedAt, toDate)
          ));
      }
      
      // Fetch weather if requested
      if (requestedLayers.includes('weather')) {
        result.weather = await db.select().from(riskWeather)
          .where(and(
            gte(riskWeather.observedAt, fromDate),
            lte(riskWeather.observedAt, toDate)
          ));
      }
      
      res.json(result);
    } catch (error) {
      console.error("Risk map points error:", error);
      res.status(500).json({ error: "Failed to fetch risk map data" });
    }
  });

  app.get("/api/riskmap/pipelines", async (req, res) => {
    try {
      const pipelines = await db.select().from(riskPipelines);
      res.json({ pipelines });
    } catch (error) {
      console.error("Risk map pipelines error:", error);
      res.status(500).json({ error: "Failed to fetch pipeline data" });
    }
  });

  app.get("/api/riskmap/topzones", async (req, res) => {
    try {
      const { from, to, count = 3 } = req.query;
      
      // Parse dates
      const fromDate = from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = to ? new Date(to as string) : new Date();
      
      // Fetch data for scoring
      const incidents = await db.select().from(riskIncidents)
        .where(and(
          gte(riskIncidents.occurredAt, fromDate),
          lte(riskIncidents.occurredAt, toDate)
        ));
      
      const repairs = await db.select().from(riskRepairs)
        .where(eq(riskRepairs.status, 'Open'));
      
      const pipelines = await db.select().from(riskPipelines);
      
      // Define grid zones (0.01° x 0.01° cells)
      const zones = [];
      const gridSize = 0.01;
      
      for (let lat = 39.90; lat < 40.10; lat += gridSize) {
        for (let lng = -75.30; lng < -75.00; lng += gridSize) {
          const zoneId = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
          const centerLat = lat + gridSize / 2;
          const centerLng = lng + gridSize / 2;
          
          // Calculate risk score for this zone
          let score = 0;
          const reasons = [];
          
          // Score incidents in zone
          const zoneIncidents = incidents.filter(inc => 
            inc.lat >= lat && inc.lat < lat + gridSize &&
            inc.lng >= lng && inc.lng < lng + gridSize
          );
          
          zoneIncidents.forEach(inc => {
            const severityWeight = inc.severity === 'High' ? 3 : inc.severity === 'Medium' ? 2 : 1;
            const daysAgo = Math.floor((Date.now() - new Date(inc.occurredAt).getTime()) / (24 * 60 * 60 * 1000));
            const timeDecay = Math.exp(-daysAgo / 30);
            score += severityWeight * timeDecay;
          });
          
          if (zoneIncidents.length > 0) {
            const highIncidents = zoneIncidents.filter(i => i.severity === 'High').length;
            const recentIncidents = zoneIncidents.filter(i => {
              const daysAgo = Math.floor((Date.now() - new Date(i.occurredAt).getTime()) / (24 * 60 * 60 * 1000));
              return daysAgo <= 7;
            }).length;
            
            if (highIncidents > 0) reasons.push(`${highIncidents} high severity incidents`);
            if (recentIncidents > 0) reasons.push(`${recentIncidents} recent incidents`);
          }
          
          // Score repairs in zone
          const zoneRepairs = repairs.filter(repair => 
            repair.lat >= lat && repair.lat < lat + gridSize &&
            repair.lng >= lng && repair.lng < lng + gridSize
          );
          
          score += zoneRepairs.length * 2; // Open repairs add weight
          if (zoneRepairs.length > 0) {
            reasons.push(`${zoneRepairs.length} open repairs`);
          }
          
          // Score pipelines in zone (simplified - check if any pipeline passes through)
          const zonePipelines = pipelines.filter(pipeline => {
            const coords = pipeline.pathGeojson.coordinates;
            return coords.some(coord => 
              coord[1] >= lat && coord[1] < lat + gridSize &&
              coord[0] >= lng && coord[0] < lng + gridSize
            );
          });
          
          zonePipelines.forEach(pipeline => {
            const age = 2024 - pipeline.installYear;
            const ageScore = Math.min(age / 50 * 2, 2); // Normalize to 0-2
            score += ageScore;
          });
          
          if (zonePipelines.length > 0) {
            const oldPipelines = zonePipelines.filter(p => 2024 - p.installYear > 40).length;
            if (oldPipelines > 0) reasons.push(`${oldPipelines} aging pipelines`);
          }
          
          if (score > 0) {
            zones.push({
              id: zoneId,
              centerLat,
              centerLng,
              score: Math.round(score * 100) / 100,
              reasons
            });
          }
        }
      }
      
      // Sort and return top zones
      zones.sort((a, b) => b.score - a.score);
      const topZones = zones.slice(0, parseInt(count as string));
      
      res.json({ zones: topZones });
    } catch (error) {
      console.error("Risk map top zones error:", error);
      res.status(500).json({ error: "Failed to calculate risk zones" });
    }
  });

  app.post("/api/riskmap/ask", async (req, res) => {
    try {
      const { question, from, to } = req.body;
      
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: "Question is required" });
      }
      
      // Get top zones for context
      const topZonesRes = await fetch(`http://localhost:5000/api/riskmap/topzones?from=${from || ''}&to=${to || ''}&count=5`);
      const topZonesData = await topZonesRes.json();
      
      let answer = '';
      
      // Try OpenAI if available
      if (process.env.OPENAI_API_KEY) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          
          const systemPrompt = `You are a utility risk analyst. Analyze the provided risk zone data and answer questions concisely in 120 words or less. Focus on actionable insights about high-risk areas, recent incidents, and infrastructure concerns.`;
          
          const context = `Top Risk Zones Data:
${topZonesData.zones.map((zone, i) => 
  `${i + 1}. Zone ${zone.id} (Score: ${zone.score}) - ${zone.reasons.join(', ')}`
).join('\n')}`;
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Context: ${context}\n\nQuestion: ${question}` }
            ],
            max_tokens: 200
          });
          
          answer = response.choices[0].message.content || '';
        } catch (aiError) {
          console.log("OpenAI request failed, using rule-based response");
          // Fall through to rule-based response
        }
      }
      
      // Rule-based fallback
      if (!answer) {
        if (topZonesData.zones.length > 0) {
          const topZone = topZonesData.zones[0];
          answer = `Based on current data analysis, Zone ${topZone.id} shows the highest risk (score: ${topZone.score}). Key concerns: ${topZone.reasons.join(', ')}. `;
          
          if (topZonesData.zones.length > 1) {
            answer += `Also monitor Zones ${topZonesData.zones.slice(1, 3).map(z => z.id).join(' and ')} for elevated risk levels. `;
          }
          
          answer += `Recommend prioritizing inspections and preventive maintenance in these areas.`;
        } else {
          answer = `Current risk analysis shows no significant high-risk zones in the selected timeframe. Continue regular monitoring and maintenance schedules.`;
        }
      }
      
      res.json({ answer: answer.trim() });
    } catch (error) {
      console.error("Risk map ask error:", error);
      res.status(500).json({ error: "Failed to process risk analysis question" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
