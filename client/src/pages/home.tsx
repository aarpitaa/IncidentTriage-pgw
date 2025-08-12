import { useState } from "react";
import { Link, useLocation } from "wouter";
import IncidentForm from "@/components/incident-form";
import AiSuggestionsPanel from "@/components/ai-suggestions-panel";
import TeamsCardPreview from "@/components/teams-card-preview";
import EnhancedIncidentHistory from "@/components/enhanced-incident-history";
import IncidentMap from "@/components/incident-map";
import IncidentsMap from "@/components/incidents-map";
import SettingsBanner from "@/components/settings-banner";
import AuditTrail from "@/components/audit-trail";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnrichResponse } from "@shared/schema";
import { BarChart3, Home as HomeIcon, Settings, MapPin, ExternalLink } from "lucide-react";

export default function Home() {
  const [location] = useLocation();
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
    <div className="bg-white dark:bg-gray-900 font-sans min-h-screen transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <HomeIcon className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                IncidentTriage<a 
                  href="https://www.pgworks.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary italic text-sm hover:text-primary/80 transition-colors cursor-pointer"
                >
                  pgw
                </a>
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Navigation */}
              <nav className="hidden md:flex space-x-2">
                <Link href="/">
                  <Button 
                    variant={location === "/" ? "default" : "ghost"} 
                    size="sm" 
                    className="text-sm"
                  >
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Incidents
                  </Button>
                </Link>
                <Link href="/analytics">
                  <Button 
                    variant={location === "/analytics" ? "default" : "ghost"} 
                    size="sm"
                    className="text-sm"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                </Link>
                <Link href="/risk-map">
                  <Button 
                    variant={location === "/risk-map" ? "default" : "ghost"} 
                    size="sm"
                    className="text-sm"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Risk Map
                  </Button>
                </Link>
              </nav>
              
              <ThemeToggle />
              <SettingsBanner />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
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
            
            {/* Always show incidents map */}
            <IncidentsMap />
            
            {/* City Risk Map Simulator Button */}
            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open("/risk-map", "_blank")}
              >
                <MapPin className="h-4 w-4 mr-2" />
                City Risk Map Simulator
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* Right Column: Incident History + Individual Map + Audit Trail */}
          <div className="xl:col-span-3 space-y-6">
            <EnhancedIncidentHistory />
            
            {/* Individual incident map when one is selected */}
            {lastSavedIncident && lastSavedIncident.address && (
              <IncidentMap 
                incident={lastSavedIncident}
                onCoordinatesUpdate={(lat, lng) => {
                  // Could implement real-time coordinate updates here
                  console.log(`Updated coordinates: ${lat}, lng}`);
                }}
              />
            )}
            
            {lastSavedIncident && (
              <AuditTrail incidentId={lastSavedIncident.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
