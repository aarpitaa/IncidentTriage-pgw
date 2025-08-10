import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Incident } from "@shared/schema";
import IncidentDetail from "./incident-detail";

const categoryIcons: Record<string, string> = {
  'Leak': '💧',
  'Odor': '👃',
  'Outage': '⚡',
  'Billing': '💳',
  'Meter': '🧭',
  'Other': '📄'
};

export default function EnhancedIncidentHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: incidents = [], isLoading, refetch } = useQuery<Incident[]>({
    queryKey: ["/api/incidents", { 
      severity: severityFilter, 
      category: categoryFilter, 
      q: debouncedSearch,
      sort: sortBy,
      dir: sortDir 
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (severityFilter) params.append("severity", severityFilter);
      if (categoryFilter) params.append("category", categoryFilter);
      if (debouncedSearch) params.append("q", debouncedSearch);
      if (sortBy) params.append("sort", sortBy);
      if (sortDir) params.append("dir", sortDir);
      
      const response = await fetch(`/api/incidents?${params}`);
      if (!response.ok) throw new Error("Failed to fetch incidents");
      return response.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: any[]) => {
      const response = await fetch("/api/incidents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Import failed");
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      toast({
        title: "Import Successful",
        description: `Imported ${result.inserted} incidents, skipped ${result.skipped}.`,
      });
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "Failed to import incidents.",
        variant: "destructive",
      });
    },
  });

  const handleExportCSV = async () => {
    try {
      const response = await fetch("/api/incidents/export.csv");
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "incidents.csv";
      link.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Incidents exported as CSV file.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export incidents.",
        variant: "destructive",
      });
    }
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const incidents = Array.isArray(data) ? data : [data];
        importMutation.mutate(incidents);
      } catch (error) {
        toast({
          title: "Invalid File",
          description: "Failed to parse JSON file.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const clearFilters = () => {
    setSearchQuery("");
    setSeverityFilter("");
    setCategoryFilter("");
    setSortBy("created_at");
    setSortDir("desc");
  };

  const hasActiveFilters = searchQuery || severityFilter || categoryFilter || sortBy !== "created_at" || sortDir !== "desc";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Incident History</CardTitle>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <i className="fas fa-download mr-2"></i>
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <i className="fas fa-upload mr-2"></i>
                Import JSON
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="Search incidents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Created</SelectItem>
                    <SelectItem value="updated_at">Updated</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={setSortDir}>
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">↓</SelectItem>
                    <SelectItem value="asc">↑</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">Severity:</span>
                {["High", "Medium", "Low"].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(severityFilter === sev ? "" : sev)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      severityFilter === sev 
                        ? getSeverityColor(sev)
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 font-medium">Category:</span>
                {["Leak", "Outage", "Billing", "Meter", "Odor", "Other"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      categoryFilter === cat 
                        ? getCategoryColor(cat)
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {categoryIcons[cat]} {cat}
                  </button>
                ))}
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs ml-2">
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse border rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <i className="fas fa-inbox text-4xl mb-4 text-gray-300"></i>
              <h3 className="text-lg font-medium mb-2">No incidents found</h3>
              <p className="text-sm">
                {hasActiveFilters ? "Try adjusting your filters" : "No incidents have been created yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedIncidentId(incident.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                          INC-{new Date().getFullYear()}-{incident.id.toString().padStart(4, '0')}
                        </span>
                        <Badge className={`${getSeverityColor(incident.severity)} border text-xs whitespace-nowrap`}>
                          {incident.severity}
                        </Badge>
                        <Badge className={`${getCategoryColor(incident.category)} border text-xs whitespace-nowrap`}>
                          {categoryIcons[incident.category]} {incident.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-1 leading-relaxed">{incident.summary}</p>
                      {incident.address && (
                        <p className="text-xs text-gray-500">📍 {incident.address}</p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 ml-4 whitespace-nowrap">
                      {formatDistanceToNow(new Date(incident.createdAt))} ago
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incident Detail Modal */}
      {selectedIncidentId && (
        <IncidentDetail
          incidentId={selectedIncidentId}
          onClose={() => setSelectedIncidentId(null)}
        />
      )}
    </>
  );
}