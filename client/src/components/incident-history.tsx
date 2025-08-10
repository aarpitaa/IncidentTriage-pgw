import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Incident } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function IncidentHistory() {
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  const { data: incidents = [], isLoading, refetch } = useQuery<Incident[]>({
    queryKey: ["/api/incidents", { severity: severityFilter, category: categoryFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter) params.append("severity", severityFilter);
      if (categoryFilter) params.append("category", categoryFilter);
      
      const response = await fetch(`/api/incidents?${params}`);
      if (!response.ok) throw new Error("Failed to fetch incidents");
      return response.json();
    },
  });

  const handleExportCSV = () => {
    if (!incidents.length) return;

    const headers = ["ID", "Address", "Category", "Severity", "Summary", "Created At"];
    const csvData = incidents.map(incident => [
      incident.id,
      incident.address || "",
      incident.category,
      incident.severity,
      incident.summary.replace(/,/g, ";"),
      incident.createdAt
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "incidents.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High": return "bg-red-100 text-red-800";
      case "Medium": return "bg-yellow-100 text-yellow-800";
      case "Low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      "Leak": "bg-orange-100 text-orange-800",
      "Outage": "bg-blue-100 text-blue-800",
      "Billing": "bg-purple-100 text-purple-800",
      "Meter": "bg-teal-100 text-teal-800",
      "Odor": "bg-amber-100 text-amber-800",
      "Other": "bg-gray-100 text-gray-800"
    };
    return colors[category as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Incident History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Severity</label>
            <Select value={severityFilter || "all-severities"} onValueChange={(value) => setSeverityFilter(value === "all-severities" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-severities">All Severities</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
            <Select value={categoryFilter || "all-categories"} onValueChange={(value) => setCategoryFilter(value === "all-categories" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-categories">All Categories</SelectItem>
                <SelectItem value="Leak">Leak</SelectItem>
                <SelectItem value="Outage">Outage</SelectItem>
                <SelectItem value="Billing">Billing</SelectItem>
                <SelectItem value="Meter">Meter</SelectItem>
                <SelectItem value="Odor">Odor</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!incidents.length}
              className="flex-1"
            >
              <i className="fas fa-download mr-1"></i>
              Export CSV
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="flex-1"
            >
              <i className="fas fa-refresh mr-1"></i>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Incident List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Showing {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
            </span>
            <div className="text-sm text-gray-500">
              <i className="fas fa-clock mr-1"></i>
              Last updated: {formatDistanceToNow(new Date())} ago
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center">
              <i className="fas fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
              <p className="text-gray-500">Loading incidents...</p>
            </div>
          ) : incidents.length === 0 ? (
            <div className="p-6 text-center">
              <i className="fas fa-inbox text-3xl text-gray-400 mb-2"></i>
              <p className="text-gray-500">No incidents found</p>
              <p className="text-sm text-gray-400">Create your first incident to see it here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {incidents.map((incident) => (
                <div 
                  key={incident.id}
                  className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">
                        #INC-{new Date().getFullYear()}-{incident.id.toString().padStart(4, '0')}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(incident.severity)}`}>
                        {incident.severity.toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(incident.category)}`}>
                        {incident.category}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(incident.createdAt))} ago
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {incident.summary.length > 100 
                      ? `${incident.summary.substring(0, 100)}...` 
                      : incident.summary}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{incident.address || "No address specified"}</span>
                    <div className="flex items-center space-x-3">
                      <span>
                        <i className="fas fa-robot mr-1"></i>
                        AI Generated
                      </span>
                      <span>Agent: S. Chen</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Settings */}
      <Card>
        <CardHeader>
          <Button
            variant="ghost"
            className="flex items-center justify-between w-full text-left p-0"
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            <CardTitle>AI Settings</CardTitle>
            <i className={`fas fa-chevron-${settingsExpanded ? 'up' : 'down'} text-gray-400`}></i>
          </Button>
        </CardHeader>
        {settingsExpanded && (
          <CardContent className="space-y-4">
            <div>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="form-checkbox" />
                <span className="text-sm text-gray-700">Use Stub AI (NO_LLM mode)</span>
              </label>
              <p className="text-xs text-gray-500 ml-6">Enable for demo without API keys</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
              <Select defaultValue="gpt-4o-mini">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs text-gray-500 space-y-1">
                <div>API Status: <span className="text-green-600 font-medium">Connected</span></div>
                <div>Requests today: <span className="font-medium">0</span></div>
                <div>Avg response time: <span className="font-medium">--</span></div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </>
  );
}
