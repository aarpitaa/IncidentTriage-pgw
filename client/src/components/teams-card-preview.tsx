import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Incident } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface TeamsCardPreviewProps {
  incident: Incident | null;
}

export default function TeamsCardPreview({ incident }: TeamsCardPreviewProps) {
  const { toast } = useToast();

  const handleCopyMarkdown = () => {
    if (!incident) return;

    const nextSteps = JSON.parse(incident.nextStepsJson);
    const markdown = `
# Incident #INC-${new Date().getFullYear()}-${incident.id.toString().padStart(4, '0')}

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
        description: "Teams card markdown has been copied to your clipboard.",
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High": return "bg-red-100 text-red-800";
      case "Medium": return "bg-yellow-100 text-yellow-800";
      case "Low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "High": return "bg-red-500";
      case "Medium": return "bg-yellow-500";
      case "Low": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  if (!incident) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Teams Card Preview</h3>
            <Button 
              variant="outline"
              size="sm"
              disabled
            >
              <i className="fas fa-copy mr-2"></i>
              Copy as Markdown
            </Button>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-card-blank text-3xl mb-2"></i>
            <p>Save an incident to see the Teams card preview</p>
          </div>
        </div>
      </div>
    );
  }

  const nextSteps = JSON.parse(incident.nextStepsJson);
  const incidentNumber = `INC-${new Date().getFullYear()}-${incident.id.toString().padStart(4, '0')}`;

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Teams Card Preview</h3>
          <Button 
            variant="outline"
            size="sm"
            onClick={handleCopyMarkdown}
          >
            <i className="fas fa-copy mr-2"></i>
            Copy as Markdown
          </Button>
        </div>
      </div>
      <div className="p-6">
        {/* Teams Card Mockup */}
        <div className="bg-white border-2 border-gray-200 rounded-lg p-4 max-w-md">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className={`w-6 h-6 ${getSeverityIcon(incident.severity)} rounded-full flex items-center justify-center`}>
                <i className="fas fa-exclamation text-white text-xs"></i>
              </div>
              <span className="font-medium text-gray-900">#{incidentNumber}</span>
            </div>
            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(incident.severity)}`}>
              {incident.severity.toUpperCase()}
            </span>
          </div>
          <h4 className="font-medium text-gray-900 mb-2">{incident.summary.substring(0, 60)}...</h4>
          <p className="text-sm text-gray-600 mb-3">{incident.summary}</p>
          <div className="text-sm">
            <p className="font-medium text-gray-900 mb-1">Next Steps:</p>
            <ul className="text-gray-600 space-y-1">
              {nextSteps.slice(0, 3).map((step: string, index: number) => (
                <li key={index}>• {step}</li>
              ))}
              {nextSteps.length > 3 && (
                <li className="text-gray-400">... and {nextSteps.length - 3} more</li>
              )}
            </ul>
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>Created: {formatDistanceToNow(new Date(incident.createdAt))} ago</span>
            <span>Agent: S. Chen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
