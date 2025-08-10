import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface AuditTrailProps {
  incidentId: number;
}

interface Audit {
  id: number;
  incidentId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  userId: string | null;
  action: string;
  createdAt: string;
}

export default function AuditTrail({ incidentId }: AuditTrailProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: audits = [], isLoading } = useQuery({
    queryKey: ["/api/incidents", incidentId, "audits"],
    queryFn: async () => {
      const response = await fetch(`/api/incidents/${incidentId}`);
      if (!response.ok) throw new Error("Failed to fetch incident details");
      const data = await response.json();
      return data.audits as Audit[];
    },
    enabled: !!incidentId,
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE": return "bg-green-100 text-green-800 border-green-200";
      case "UPDATE": return "bg-blue-100 text-blue-800 border-blue-200";
      case "AI_SUGGESTION": return "bg-purple-100 text-purple-800 border-purple-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatValue = (value: string | null) => {
    if (!value) return "Empty";
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.join(", ");
      }
      return value;
    } catch {
      return value;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!audits.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No audit trail available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between h-auto p-0">
              <CardTitle className="text-sm">Audit Trail ({audits.length} changes)</CardTitle>
              <i className={`fas fa-chevron-${isOpen ? "up" : "down"} text-xs`}></i>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {audits.map((audit) => (
                <div key={audit.id} className="border-l-2 border-gray-200 pl-4 pb-3 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${getActionColor(audit.action)}`}>
                          {audit.action}
                        </Badge>
                        <span className="text-xs text-gray-500 font-medium">
                          {audit.fieldName}
                        </span>
                      </div>
                      <div className="text-xs space-y-1">
                        {audit.oldValue && (
                          <div>
                            <span className="text-gray-500">From:</span>{" "}
                            <span className="text-red-600 line-through">
                              {formatValue(audit.oldValue)}
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">To:</span>{" "}
                          <span className="text-green-600 font-medium">
                            {formatValue(audit.newValue)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 ml-2">
                      {formatDistanceToNow(new Date(audit.createdAt))} ago
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}