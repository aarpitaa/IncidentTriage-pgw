#!/usr/bin/env node
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });

const sampleIncidents = [
  {
    address: "789 Pine Street, Downtown",
    description: "Persistent strong gas odor reported by multiple residents in apartment building. Smell has been present for over 2 hours and appears to be getting stronger.",
    category: "Leak",
    severity: "High",
    summary: "Multi-unit gas leak emergency requiring immediate evacuation and response",
    nextStepsJson: JSON.stringify([
      "Dispatch emergency response team immediately",
      "Order building evacuation",
      "Contact fire department and gas company",
      "Establish safety perimeter",
      "Monitor air quality levels"
    ]),
    customerMessage: "EMERGENCY: Please evacuate the building immediately. Our emergency response team is en route. Do not use any electrical switches, lighters, or create sparks. Move to a safe distance and await further instructions."
  },
  {
    address: "456 Elm Avenue, Riverside District",
    description: "Complete power outage affecting approximately 200 homes in residential area. Transformer explosion reported by witnesses. Duration: 45 minutes and ongoing.",
    category: "Outage",
    severity: "High", 
    summary: "Large-scale power outage due to transformer failure affecting 200+ customers",
    nextStepsJson: JSON.stringify([
      "Deploy emergency restoration crew",
      "Assess transformer damage",
      "Coordinate traffic control for affected intersections",
      "Set up temporary power for critical facilities",
      "Provide regular updates to customers"
    ]),
    customerMessage: "We are aware of the power outage affecting your area. A transformer failure has caused this outage affecting approximately 200 customers. Our crews are working to restore service. Estimated restoration time: 4-6 hours."
  },
  {
    address: "123 Oak Road, Suburban Hills",
    description: "Customer reports receiving electric bill showing usage 400% higher than normal. No changes in household patterns or new appliances. Requesting meter verification.",
    category: "Billing",
    severity: "Medium",
    summary: "Billing dispute - abnormally high usage requiring meter investigation",
    nextStepsJson: JSON.stringify([
      "Schedule meter reading verification",
      "Review usage history for past 12 months",
      "Check for meter malfunction or tampering",
      "Investigate possible billing calculation errors",
      "Provide temporary payment arrangement if needed"
    ]),
    customerMessage: "We understand your concern about the unusually high bill. We will schedule a meter verification within 48 hours and review your account history. You may request a payment plan while we investigate this matter."
  },
  {
    address: "321 Maple Drive, Old Town",
    description: "Intermittent power fluctuations causing appliances to turn on/off repeatedly. Voltage irregularities reported by 3 neighboring homes. Issue started this morning.",
    category: "Outage",
    severity: "Medium",
    summary: "Voltage irregularities affecting multiple homes - potential equipment issue",
    nextStepsJson: JSON.stringify([
      "Dispatch electrical technician for voltage testing",
      "Check transformer and power lines for faults",
      "Test voltage at multiple customer locations",
      "Inspect for loose connections or damaged equipment",
      "Consider temporary service adjustments"
    ]),
    customerMessage: "We are investigating voltage irregularities in your area. Please unplug sensitive electronics until our technician can assess and resolve the issue. We expect to have this resolved within 2-4 hours."
  },
  {
    address: "567 Cedar Lane, Industrial Park",
    description: "Digital meter reading shows erratic consumption patterns. Customer reports meter display flickering and showing random numbers. Installed 6 months ago.",
    category: "Meter",
    severity: "Low",
    summary: "Malfunctioning digital meter displaying erratic readings",
    nextStepsJson: JSON.stringify([
      "Schedule meter replacement appointment",
      "Verify meter communication systems",
      "Calculate billing adjustment for affected period",
      "Test new meter installation",
      "Provide customer with installation confirmation"
    ]),
    customerMessage: "We will schedule a meter replacement within 72 hours. Your account will be adjusted for any billing discrepancies caused by the malfunctioning meter. We apologize for any inconvenience."
  },
  {
    address: "890 Birch Court, Westside",
    description: "Strong sewage-like odor near gas meter outside home. Customer concerned about potential gas leak but smell is different from typical gas odor. Persistent for 24 hours.",
    category: "Odor",
    severity: "Low",
    summary: "Non-gas odor investigation near utility meter area",
    nextStepsJson: JSON.stringify([
      "Schedule odor investigation appointment",
      "Test for gas leaks as safety precaution",
      "Coordinate with water/sewer department",
      "Inspect surrounding area for source",
      "Provide customer with findings and recommendations"
    ]),
    customerMessage: "We will investigate the odor within 24 hours. While this does not appear to be a gas leak, we will conduct safety tests as a precaution. Please contact us immediately if the odor becomes stronger or changes character."
  }
];

async function seedDatabase() {
  console.log("Starting database seed...");
  
  try {
    for (let i = 0; i < sampleIncidents.length; i++) {
      const incidentData = sampleIncidents[i];
      
      // Create incident
      const [incident] = await db
        .insert(schema.incidents)
        .values(incidentData)
        .returning();
      
      console.log(`Created incident ${incident.id}: ${incident.category} - ${incident.severity}`);
      
      // Create AI suggestion for each incident
      const aiSuggestionData = {
        incidentId: incident.id,
        rawJson: JSON.stringify({
          category: incident.category,
          severity: incident.severity === "High" ? "Medium" : incident.severity, // Simulate AI suggesting different severity
          summary: `AI suggested: ${incident.summary}`,
          nextSteps: JSON.parse(incident.nextStepsJson),
          customerMessage: incident.customerMessage
        }),
        model: "gpt-4o",
        promptVersion: "v1.0"
      };
      
      const [aiSuggestion] = await db
        .insert(schema.aiSuggestions)
        .values(aiSuggestionData)
        .returning();
      
      // Create audit trail
      const auditData = {
        incidentId: incident.id,
        beforeJson: aiSuggestionData.rawJson,
        afterJson: JSON.stringify({
          category: incident.category,
          severity: incident.severity,
          summary: incident.summary,
          nextSteps: JSON.parse(incident.nextStepsJson),
          customerMessage: incident.customerMessage
        }),
        changedFieldsJson: JSON.stringify(incident.severity === "High" ? ["severity"] : [])
      };
      
      await db
        .insert(schema.audits)
        .values(auditData);
      
      console.log(`Created AI suggestion and audit for incident ${incident.id}`);
    }
    
    console.log(`\n✅ Successfully seeded ${sampleIncidents.length} incidents with AI suggestions and audit trails.`);
    
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();