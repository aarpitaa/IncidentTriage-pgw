import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertIncidentSchema, InsertIncident, EnrichResponse } from "@shared/schema";
import { useState } from "react";

interface AiSuggestionsPanelProps {
  suggestion: EnrichResponse;
  onSave: (incident: any, originalSuggestion: EnrichResponse) => void;
  onRegenerate: (suggestion: EnrichResponse) => void;
}

export default function AiSuggestionsPanel({ suggestion, onSave, onRegenerate }: AiSuggestionsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<InsertIncident>({
    resolver: zodResolver(insertIncidentSchema),
    defaultValues: {
      address: "",
      description: "",
      category: suggestion.category,
      severity: suggestion.severity,
      summary: suggestion.summary,
      nextStepsJson: JSON.stringify(suggestion.nextSteps),
      customerMessage: suggestion.customerMessage,
    },
  });

  // Update form when suggestion changes
  useState(() => {
    form.setValue("category", suggestion.category);
    form.setValue("severity", suggestion.severity);
    form.setValue("summary", suggestion.summary);
    form.setValue("nextStepsJson", JSON.stringify(suggestion.nextSteps));
    form.setValue("customerMessage", suggestion.customerMessage);
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InsertIncident & { aiSuggestionRaw: EnrichResponse }) => {
      const response = await apiRequest("POST", "/api/incidents", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incidents"] });
      onSave(data, suggestion);
      toast({
        title: "Incident Saved",
        description: "Incident has been successfully created and saved.",
      });
    },
    onError: (error) => {
      console.error("Save error:", error);
      toast({
        title: "Save Failed",
        description: "Failed to save incident. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (values: InsertIncident) => {
    setIsSaving(true);
    saveMutation.mutate(
      { ...values, aiSuggestionRaw: suggestion },
      {
        onSettled: () => setIsSaving(false),
      }
    );
  };

  const nextStepsArray = (() => {
    try {
      const parsed = JSON.parse(form.watch("nextStepsJson"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const handleNextStepsChange = (value: string) => {
    const steps = value.split('\n').filter(step => step.trim());
    form.setValue("nextStepsJson", JSON.stringify(steps));
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 bg-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <i className="fas fa-robot text-primary"></i>
            <h3 className="text-lg font-medium text-gray-900">AI Suggestions</h3>
            <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
              Generated in 1.2s
            </span>
          </div>
          <button 
            className="text-sm text-primary hover:text-primary/80"
            onClick={() => onRegenerate(suggestion)}
          >
            <i className="fas fa-redo mr-1"></i>
            Regenerate
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">Review and edit the AI-generated suggestions below. All fields are editable.</p>
      </div>
      
      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Leak">Leak</SelectItem>
                        <SelectItem value="Odor">Odor</SelectItem>
                        <SelectItem value="Outage">Outage</SelectItem>
                        <SelectItem value="Billing">Billing</SelectItem>
                        <SelectItem value="Meter">Meter</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severity</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="nextStepsJson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Next Steps (one per line)</FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={4}
                      placeholder="Enter each step on a new line"
                      className="font-mono"
                      value={nextStepsArray.join('\n')}
                      onChange={(e) => handleNextStepsChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="customerMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Message</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-500">
                <i className="fas fa-info-circle mr-1"></i>
                Make any necessary edits, then save to create the incident record.
              </div>
              <Button 
                type="submit"
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSaving ? (
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                ) : (
                  <i className="fas fa-save mr-2"></i>
                )}
                {isSaving ? "Saving..." : "Save Incident"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
