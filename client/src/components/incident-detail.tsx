import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { diffWords } from "diff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface IncidentDetailProps {
  incidentId: number;
  onClose: () => void;
}

interface Incident {
  id: number;
  address: string | null;
  description: string;
  category: string;
  severity: string;
  summary: string;
  nextStepsJson: string;
  customerMessage: string;
  createdAt: string;
  updatedAt: string;
}

interface AiSuggestion {
  id: number;
  incidentId: number;
  rawJson: string;
  model: string;
  promptVersion: string;
  createdAt: string;
}

interface Audit {
  id: number;
  incidentId: number;
  beforeJson: string;
  afterJson: string;
  changedFieldsJson: string;
  createdAt: string;
}

const categoryIcons: Record<string, string> = {
  'Leak': '💧',
  'Odor': '👃',
  'Outage': '⚡',
  'Billing': '💳',
  'Meter': '🧭',
  'Other': '📄'
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case "High": return "bg-red-100 text-red-800 border-red-200";
    case "Medium": return "bg-orange-100 text-orange-800 border-orange-200";
    case "Low": return "bg-green-100 text-green-800 border-green-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "Leak": return "bg-blue-100 text-blue-800 border-blue-200";
    case "Outage": return "bg-purple-100 text-purple-800 border-purple-200";
    case "Billing": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "Meter": return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "Odor": return "bg-pink-100 text-pink-800 border-pink-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

function DiffViewer({ original, modified, label }: { original: string; modified: string; label: string }) {
  const diffs = diffWords(original, modified);
  
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm text-gray-700">{label}</h4>
      <div className="p-3 bg-gray-50 rounded border text-sm">
        {diffs.map((part, index) => (
          <span
            key={index}
            className={
              part.added
                ? "bg-green-200 text-green-800"
                : part.removed
                ? "bg-red-200 text-red-800 line-through"
                : ""
            }
          >
            {part.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function IncidentDetail({ incidentId, onClose }: IncidentDetailProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/incidents", incidentId],
    queryFn: async () => {
      const response = await fetch(`/api/incidents/${incidentId}`);
      if (!response.ok) throw new Error("Failed to fetch incident");
      return response.json() as Promise<{
        incident: Incident;
        aiSuggestions: AiSuggestion[];
        audits: Audit[];
      }>;
    },
  });

  const handleExportJSON = async () => {
    try {
      const response = await fetch(`/api/incidents/${incidentId}/export.json`);
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `incident-${incidentId}.json`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Incident data exported as JSON file.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export incident data.",
        variant: "destructive",
      });
    }
  };

  const handleCopyTeamsMarkdown = () => {
    if (!data?.incident) return;

    const incident = data.incident;
    const nextSteps = JSON.parse(incident.nextStepsJson);
    const incidentNumber = `INC-${new Date().getFullYear()}-${incident.id.toString().padStart(4, '0')}`;
    
    const markdown = `
# Incident ${incidentNumber}

**Severity:** ${incident.severity}  
**Category:** ${incident.category}

## Summary
${incident.summary}

## Next Steps
${nextSteps.map((step: string) => `- ${step}`).join('\n')}

## Customer Message
${incident.customerMessage}

---
*Created: ${formatDistanceToNow(new Date(incident.createdAt))} ago*
    `.trim();

    navigator.clipboard.writeText(markdown).then(() => {
      toast({
        title: "Copied to Clipboard",
        description: "Teams card markdown has been copied.",
      });
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">Failed to load incident details.</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  const { incident, aiSuggestions, audits } = data;
  const latestAiSuggestion = aiSuggestions[0];
  const nextSteps = JSON.parse(incident.nextStepsJson);
  const incidentNumber = `INC-${new Date().getFullYear()}-${incident.id.toString().padStart(4, '0')}`;
  
  // Calculate changed fields
  const changedFields = audits.length > 0 ? JSON.parse(audits[0].changedFieldsJson) : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Incident {incidentNumber}
            </h2>
            <div className="flex items-center space-x-2">
              <Badge className={`${getSeverityColor(incident.severity)} border`}>
                {incident.severity}
              </Badge>
              <Badge className={`${getCategoryColor(incident.category)} border`}>
                {categoryIcons[incident.category] || '📄'} {incident.category}
              </Badge>
              {changedFields.length > 0 && (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  {changedFields.length} fields changed
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              <i className="fas fa-download mr-2"></i>
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyTeamsMarkdown}>
              <i className="fas fa-copy mr-2"></i>
              Copy Teams Card
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <i className="fas fa-times"></i>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="mx-6 mt-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai-suggestion">AI Suggestion</TabsTrigger>
              <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <TabsContent value="overview" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Incident Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {incident.address && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">Address</label>
                        <p className="mt-1">{incident.address}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-600">Description</label>
                      <p className="mt-1">{incident.description}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Summary</label>
                      <p className="mt-1">{incident.summary}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Next Steps</label>
                      <ul className="mt-1 list-disc list-inside space-y-1">
                        {nextSteps.map((step: string, index: number) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Customer Message</label>
                      <p className="mt-1">{incident.customerMessage}</p>
                    </div>
                    <div className="flex space-x-4 text-sm text-gray-500">
                      <span>Created: {formatDistanceToNow(new Date(incident.createdAt))} ago</span>
                      <span>Updated: {formatDistanceToNow(new Date(incident.updatedAt))} ago</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ai-suggestion" className="space-y-4 mt-4">
                {latestAiSuggestion ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">AI vs Final Comparison</CardTitle>
                      <p className="text-sm text-gray-600">
                        Model: {latestAiSuggestion.model} • {formatDistanceToNow(new Date(latestAiSuggestion.createdAt))} ago
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {(() => {
                        const aiData = JSON.parse(latestAiSuggestion.rawJson);
                        return (
                          <>
                            {changedFields.includes('summary') && (
                              <DiffViewer
                                original={aiData.summary}
                                modified={incident.summary}
                                label="Summary"
                              />
                            )}
                            {changedFields.includes('customerMessage') && (
                              <DiffViewer
                                original={aiData.customerMessage}
                                modified={incident.customerMessage}
                                label="Customer Message"
                              />
                            )}
                            {changedFields.includes('nextSteps') && (
                              <DiffViewer
                                original={aiData.nextSteps.join('\n')}
                                modified={nextSteps.join('\n')}
                                label="Next Steps"
                              />
                            )}
                            {changedFields.includes('severity') && (
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Severity</h4>
                                <div className="flex space-x-2">
                                  <Badge className={`${getSeverityColor(aiData.severity)} border line-through`}>
                                    AI: {aiData.severity}
                                  </Badge>
                                  <Badge className={`${getSeverityColor(incident.severity)} border`}>
                                    Final: {incident.severity}
                                  </Badge>
                                </div>
                              </div>
                            )}
                            {changedFields.includes('category') && (
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Category</h4>
                                <div className="flex space-x-2">
                                  <Badge className={`${getCategoryColor(aiData.category)} border line-through`}>
                                    AI: {aiData.category}
                                  </Badge>
                                  <Badge className={`${getCategoryColor(incident.category)} border`}>
                                    Final: {incident.category}
                                  </Badge>
                                </div>
                              </div>
                            )}
                            {changedFields.length === 0 && (
                              <p className="text-sm text-gray-500 italic">No changes made from AI suggestion</p>
                            )}
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-gray-500 italic">No AI suggestion available</p>
                )}
              </TabsContent>

              <TabsContent value="audit" className="space-y-4 mt-4">
                {audits.length > 0 ? (
                  <div className="space-y-3">
                    {audits.map((audit) => (
                      <Card key={audit.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline">
                                {JSON.parse(audit.changedFieldsJson).length} changes
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {formatDistanceToNow(new Date(audit.createdAt))} ago
                              </span>
                            </div>
                          </div>
                          <div className="text-sm">
                            <p className="font-medium text-gray-700 mb-1">Changed fields:</p>
                            <div className="flex flex-wrap gap-1">
                              {JSON.parse(audit.changedFieldsJson).map((field: string) => (
                                <Badge key={field} variant="secondary" className="text-xs">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No audit trail available</p>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}