import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface HealthData {
  ok: boolean;
  time: string;
  mode: "OpenAI" | "DummyAI";
  model: string | null;
  db: string;
  build: string;
}

export default function SettingsBanner() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Failed to fetch health");
      return response.json() as Promise<HealthData>;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading || !health) {
    return (
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="bg-gray-50">
          <div className="w-2 h-2 bg-gray-400 rounded-full mr-2 animate-pulse"></div>
          Loading...
        </Badge>
      </div>
    );
  }

  const isDummyAI = health.mode === "DummyAI";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center space-x-2 hover:bg-gray-50 px-2 py-1 rounded transition-colors">
          <Badge variant="outline" className={isDummyAI ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}>
            <div className={`w-2 h-2 rounded-full mr-2 ${isDummyAI ? "bg-yellow-500" : "bg-green-500"}`}></div>
            Environment
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">System Information</h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Mode:</span>
              <Badge variant={isDummyAI ? "secondary" : "default"} className="text-xs">
                {health.mode}
              </Badge>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Model:</span>
              <span className="font-mono text-xs">{health.model || "—"}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Database:</span>
              <Badge variant="outline" className="text-xs capitalize">
                {health.db}
              </Badge>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Build:</span>
              <span className="font-mono text-xs">{health.build.slice(0, 8)}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <Badge variant="default" className="text-xs bg-green-100 text-green-800">
                Online
              </Badge>
            </div>
          </div>
          
          {isDummyAI && (
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-amber-600">
                💡 Add OPENAI_API_KEY + USE_OPENAI=true to enable live AI
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}