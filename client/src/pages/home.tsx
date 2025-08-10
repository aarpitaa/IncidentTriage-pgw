import { useState } from "react";
import IncidentForm from "@/components/incident-form";
import AiSuggestionsPanel from "@/components/ai-suggestions-panel";
import TeamsCardPreview from "@/components/teams-card-preview";
import IncidentHistory from "@/components/incident-history";
import AuditTrail from "@/components/audit-trail";
import { EnrichResponse } from "@shared/schema";

export default function Home() {
  const [aiSuggestion, setAiSuggestion] = useState<EnrichResponse | null>(null);
  const [lastSavedIncident, setLastSavedIncident] = useState<any>(null);
  const [showDiffNotification, setShowDiffNotification] = useState(false);
  const [changedFieldsCount, setChangedFieldsCount] = useState(0);

  const handleAiEnrichment = (suggestion: EnrichResponse) => {
    setAiSuggestion(suggestion);
  };

  const handleIncidentSaved = (incident: any, originalSuggestion: EnrichResponse | null) => {
    setLastSavedIncident(incident);
    setAiSuggestion(null);
    
    // Calculate changed fields
    if (originalSuggestion) {
      let changes = 0;
      if (originalSuggestion.category !== incident.category) changes++;
      if (originalSuggestion.severity !== incident.severity) changes++;
      if (originalSuggestion.summary !== incident.summary) changes++;
      if (JSON.stringify(originalSuggestion.nextSteps) !== incident.nextStepsJson) changes++;
      if (originalSuggestion.customerMessage !== incident.customerMessage) changes++;
      
      setChangedFieldsCount(changes);
      setShowDiffNotification(changes > 0);
    }
  };

  const clearForm = () => {
    setAiSuggestion(null);
    setLastSavedIncident(null);
    setShowDiffNotification(false);
  };

  return (
    <div className="bg-gray-50 font-sans min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-white text-sm"></i>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                IncidentTriage<span className="text-primary italic text-sm">pgw</span>
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* AI Status Indicator */}
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>AI Service: Active</span>
              </div>
              <div className="text-sm text-gray-500">Agent: Sarah Chen</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column: Incident Form + AI Suggestions */}
          <div className="xl:col-span-2 space-y-6">
            <IncidentForm 
              onAiEnrichment={handleAiEnrichment}
              onClear={clearForm}
            />
            
            {aiSuggestion && (
              <AiSuggestionsPanel
                suggestion={aiSuggestion}
                onSave={handleIncidentSaved}
                onRegenerate={handleAiEnrichment}
              />
            )}

            {/* Diff Notification */}
            {showDiffNotification && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-edit text-amber-600"></i>
                    <span className="text-sm font-medium text-amber-800">
                      {changedFieldsCount} fields changed from AI suggestion
                    </span>
                  </div>
                  <button 
                    className="text-sm text-amber-700 hover:text-amber-800 underline"
                    onClick={() => setShowDiffNotification(false)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <TeamsCardPreview incident={lastSavedIncident} />
          </div>

          {/* Right Column: Incident History + Audit Trail */}
          <div className="space-y-6">
            <IncidentHistory />
            {lastSavedIncident && (
              <AuditTrail incidentId={lastSavedIncident.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
