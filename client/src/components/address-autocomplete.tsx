import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Search } from "lucide-react";
import { debounce } from "@/lib/geocoding";

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Enter address...",
  className = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const searchAddresses = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Using Nominatim (OpenStreetMap) for address search
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=us&addressdetails=1`
      );
      
      if (response.ok) {
        const results = await response.json();
        setSuggestions(results || []);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Address search failed:", error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const debouncedSearch = debounce(searchAddresses, 300);

  useEffect(() => {
    if (value) {
      debouncedSearch(value);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value]);

  const handleSuggestionClick = (suggestion: AddressSuggestion) => {
    const address = suggestion.display_name;
    onChange(address);
    setShowSuggestions(false);
    setSuggestions([]);
    
    if (onSelect) {
      onSelect(address, parseFloat(suggestion.lat), parseFloat(suggestion.lon));
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow for click events
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
        setShowSuggestions(false);
      }
    }, 150);
  };

  const formatAddress = (address: string) => {
    // Clean up the address display by removing country and focusing on US addresses
    const parts = address.split(', ');
    const cleanParts = parts.filter(part => 
      !part.includes('United States') && 
      !part.includes('US') &&
      part.length > 0
    );
    
    return cleanParts.slice(0, 4).join(', ');
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className={className}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {isLoading ? (
            <i className="fas fa-spinner fa-spin text-gray-400 text-sm"></i>
          ) : (
            <MapPin className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.place_id || index}
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none border-b border-gray-100 dark:border-gray-600 last:border-b-0"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                    {formatAddress(suggestion.display_name)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {showSuggestions && value.length >= 3 && suggestions.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            No addresses found
          </div>
        </div>
      )}
    </div>
  );
}