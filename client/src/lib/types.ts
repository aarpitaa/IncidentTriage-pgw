export interface IncidentWithAudit {
  id: number;
  address?: string;
  description: string;
  category: string;
  severity: string;
  summary: string;
  nextStepsJson: string;
  customerMessage: string;
  createdAt: string;
  updatedAt: string;
  editCount?: number;
  agent?: string;
}
