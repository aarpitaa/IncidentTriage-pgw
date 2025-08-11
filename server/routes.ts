import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { storage } from "./storage";
import { createAIService } from "./services/ai";
import { enrichRequestSchema, insertIncidentSchema, categoryEnum, severityEnum } from "@shared/schema";

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
          
          // Get file size to determine if actual audio was captured
          const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
          const fileSizeKB = audioBuffer.length / 1024;
          
          let transcript: string;
          
          if (fileSizeKB > 5) {
            // Real audio was recorded, acknowledge it
            transcript = `[Audio file recorded: ${fileSizeKB.toFixed(1)}KB] Your voice recording was captured successfully, but OpenAI transcription service quota is exceeded. Please type your description manually or provide a working OpenAI API key to transcribe your recording.`;
          } else {
            // Very small audio file, likely silent
            transcript = `No clear audio detected in ${fileSizeKB.toFixed(1)}KB recording. Please speak louder and closer to microphone, or type your description manually.`;
          }
          
          return res.json({
            transcript: transcript,
            confidence: null,
            segments: [],
            mode: "quota-exceeded",
            notice: "OpenAI quota exceeded - audio captured but cannot transcribe without working API key"
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

  const httpServer = createServer(app);
  return httpServer;
}
