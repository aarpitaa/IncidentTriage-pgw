import OpenAI from "openai";
import { EnrichRequest, EnrichResponse, enrichResponseSchema } from "@shared/schema";

const SYSTEM_PROMPT = `You are a utility incident triage assistant.
Return STRICT JSON only. Fields:
- category: one of ["Leak","Odor","Outage","Billing","Meter","Other"]
- severity: one of ["Low","Medium","High"]
- summary: <=120 words, concise, operational tone
- nextSteps: array of 3–6 imperative steps
- customerMessage: <=120 words, courteous, plain language, no guarantees, safety tips if applicable

Return JSON only.`;

export class DummyAIService {
  async enrichIncident(request: EnrichRequest): Promise<EnrichResponse> {
    // Rule-based classification for consistent demo behavior
    const description = request.description.toLowerCase();
    
    let category: EnrichResponse['category'] = "Other";
    let severity: EnrichResponse['severity'] = "Low";
    
    // Category classification
    if (description.includes("gas") || description.includes("leak")) {
      category = "Leak";
      severity = "High";
    } else if (description.includes("power") || description.includes("outage") || description.includes("electric")) {
      category = "Outage";
      severity = "Medium";
    } else if (description.includes("odor") || description.includes("smell")) {
      category = "Odor";
      severity = "Medium";
    } else if (description.includes("bill") || description.includes("charge") || description.includes("payment")) {
      category = "Billing";
      severity = "Low";
    } else if (description.includes("meter") || description.includes("reading")) {
      category = "Meter";
      severity = "Medium";
    }
    
    // Adjust severity based on keywords
    if (description.includes("emergency") || description.includes("urgent") || description.includes("dangerous")) {
      severity = "High";
    } else if (description.includes("minor") || description.includes("small")) {
      severity = "Low";
    }

    const summary = `${category} incident reported. ${request.description.substring(0, 80)}${request.description.length > 80 ? '...' : ''}`;
    
    const nextSteps = this.getNextStepsForCategory(category, severity);
    const customerMessage = this.getCustomerMessageForCategory(category, severity);

    return {
      category,
      severity,
      summary,
      nextSteps,
      customerMessage,
    };
  }

  private getNextStepsForCategory(category: string, severity: string): string[] {
    const baseSteps = {
      "Leak": [
        "Dispatch emergency response team immediately",
        "Advise customer to evacuate premises and avoid ignition sources",
        "Contact local fire department for safety assessment",
        "Schedule follow-up inspection within 24 hours",
        "Document incident for regulatory compliance"
      ],
      "Outage": [
        "Check system status and identify affected areas",
        "Dispatch field technician to investigate",
        "Notify customers of estimated restoration time",
        "Monitor restoration progress",
        "Confirm service restoration"
      ],
      "Odor": [
        "Dispatch technician for immediate assessment",
        "Advise customer on safety precautions",
        "Investigate source of odor",
        "Test for gas concentrations if applicable",
        "Schedule follow-up if needed"
      ],
      "Billing": [
        "Review customer account and billing history",
        "Investigate reported billing discrepancy",
        "Contact customer with findings",
        "Process adjustment if warranted",
        "Document resolution"
      ],
      "Meter": [
        "Schedule meter inspection appointment",
        "Verify meter readings and functionality",
        "Replace meter if faulty",
        "Update customer account records",
        "Confirm accurate billing going forward"
      ],
      "Other": [
        "Assess incident details and classify properly",
        "Contact customer for additional information",
        "Assign to appropriate department",
        "Schedule follow-up as needed"
      ]
    };

    return baseSteps[category as keyof typeof baseSteps] || baseSteps["Other"];
  }

  private getCustomerMessageForCategory(category: string, severity: string): string {
    const messages = {
      "Leak": "Thank you for reporting this gas leak. For your safety, please evacuate the premises immediately and avoid using any electrical switches or open flames. Our emergency response team has been dispatched and will arrive shortly. Please wait at a safe distance and call 911 if conditions worsen.",
      "Outage": "We have received your power outage report and are investigating the issue. Our technicians are working to restore service as quickly as possible. We will keep you updated on our progress and estimated restoration time.",
      "Odor": "Thank you for reporting this odor concern. For your safety, please ensure adequate ventilation and avoid potential ignition sources. A technician has been dispatched to investigate and will contact you upon arrival.",
      "Billing": "We have received your billing inquiry and will review your account details. A customer service representative will contact you within one business day with our findings and any necessary adjustments.",
      "Meter": "We have scheduled a meter inspection to address your concern. A technician will contact you to arrange a convenient appointment time. Thank you for bringing this to our attention.",
      "Other": "Thank you for contacting us. We have received your report and are reviewing it. A member of our team will be in touch within the next business day to address your concern."
    };

    return messages[category as keyof typeof messages] || messages["Other"];
  }
}

export class OpenAIService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async enrichIncident(request: EnrichRequest): Promise<EnrichResponse> {
    const userPrompt = `Address: ${request.address || 'Not specified'}
Description: ${request.description}

Classify category & severity, summarize, propose nextSteps[], and draft a customerMessage.
Return JSON only.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No response content from OpenAI");
      }

      const parsed = JSON.parse(content);
      const validated = enrichResponseSchema.parse(parsed);
      return validated;
    } catch (error) {
      console.error("OpenAI enrichment failed:", error);
      // Fallback to dummy AI
      const dummyAI = new DummyAIService();
      return dummyAI.enrichIncident(request);
    }
  }
}

export function createAIService(): DummyAIService | OpenAIService {
  const useOpenAI = process.env.USE_OPENAI === "true";
  const apiKey = process.env.OPENAI_API_KEY;

  if (useOpenAI && apiKey) {
    return new OpenAIService(apiKey);
  }

  return new DummyAIService();
}
