import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import AddressAutocomplete from "@/components/address-autocomplete";
import VoiceRecorder from "@/components/voice-recorder";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { enrichRequestSchema, EnrichRequest, EnrichResponse } from "@shared/schema";
import { useState } from "react";
import { Mic, Keyboard } from "lucide-react";

interface IncidentFormProps {
  onAiEnrichment: (suggestion: EnrichResponse) => void;
  onClear: () => void;
}

const sampleDescriptions = {
  "Gas Leak": "Strong gas odor detected in basement area. Customer reports smell started 30 minutes ago and is getting stronger. Located at residential property.",
  "Power Outage": "Complete power loss affecting entire residential block. Multiple customers reporting outage since 3:00 PM. Traffic lights also affected on Main Street.",
  "Billing Issue": "Customer received unusually high bill showing 300% increase over previous month. Usage pattern shows no significant changes in household consumption."
};

export default function IncidentForm({ onAiEnrichment, onClear }: IncidentFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  const form = useForm<EnrichRequest>({
    resolver: zodResolver(enrichRequestSchema),
    defaultValues: {
      address: "",
      description: "",
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (data: EnrichRequest) => {
      const response = await apiRequest("POST", "/api/enrich", data);
      return response.json() as Promise<EnrichResponse>;
    },
    onSuccess: (data) => {
      onAiEnrichment(data);
      toast({
        title: "AI Enrichment Complete",
        description: "Incident has been classified and suggestions generated.",
      });
    },
    onError: (error) => {
      console.error("Enrichment error:", error);
      toast({
        title: "Enrichment Failed",
        description: "Failed to enrich incident with AI. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEnrich = () => {
    const values = form.getValues();
    if (!values.description.trim()) {
      toast({
        title: "Description Required",
        description: "Please enter an incident description before enriching with AI.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    enrichMutation.mutate(values, {
      onSettled: () => setIsLoading(false),
    });
  };

  const handleClear = () => {
    form.reset();
    setIsVoiceMode(false);
    onClear();
  };

  const handleVoiceTranscription = (transcript: string) => {
    console.log('Received transcript for form:', transcript);
    form.setValue('description', transcript);
    // Trigger form validation to show the updated value
    form.trigger('description');
    setIsVoiceMode(false);
    toast({
      title: "Voice Transcript Added",
      description: "Your voice recording has been converted to text and added to the description field.",
    });
  };

  const handleSampleClick = (description: string) => {
    form.setValue("description", description);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">New Incident Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              {isVoiceMode ? "Record your incident description" : "Enter incident details to get AI-powered classification and response suggestions"}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isVoiceMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              className="flex items-center gap-2"
            >
              {isVoiceMode ? (
                <>
                  <Keyboard className="w-4 h-4" />
                  Type
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Voice
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="p-6">
        {isVoiceMode ? (
          <VoiceRecorder 
            onTranscriptionComplete={handleVoiceTranscription}
            onClose={() => setIsVoiceMode(false)}
          />
        ) : (
          <Form {...form}>
            <form className="space-y-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Address</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value || ""}
                      onChange={field.onChange}
                      onSelect={(address, lat, lng) => {
                        field.onChange(address || "");
                        // Could store coordinates for later use
                        console.log(`Selected address coordinates: ${lat}, ${lng}`);
                      }}
                      placeholder="Start typing address (e.g. 123 Main Street, Philadelphia, PA)"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Incident Description <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={4}
                      placeholder="Describe the incident in detail. Include what happened, when, and any symptoms observed..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex flex-wrap gap-3 pt-2">
              <Button 
                type="button" 
                onClick={handleEnrich}
                disabled={isLoading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isLoading ? (
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                ) : (
                  <i className="fas fa-magic mr-2"></i>
                )}
                {isLoading ? "Processing..." : "Generate Report"}
              </Button>
              
              <Button 
                type="button" 
                variant="outline"
                onClick={handleClear}
              >
                <i className="fas fa-eraser mr-2"></i>
                Clear
              </Button>
              
              {/* Sample descriptions */}
              <div className="flex flex-wrap gap-2 ml-auto items-center">
                <span className="text-xs text-gray-500">Quick samples:</span>
                {Object.entries(sampleDescriptions).map(([label, description]) => (
                  <Button
                    key={label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 hover:bg-gray-200"
                    onClick={() => handleSampleClick(description)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </form>
        </Form>
        )}
      </div>
    </div>
  );
}
