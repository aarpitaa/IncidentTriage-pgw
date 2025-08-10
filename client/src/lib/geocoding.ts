// Simple hash function for pseudo-coordinates
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Generate pseudo coordinates for demo purposes
export function generatePseudoCoordinates(address: string): { lat: number; lng: number } {
  const hash = hashString(address);
  
  // Map to Philadelphia area coordinates
  const lat = 39.90 + (hash % 200) / 1000; // Range: 39.90 - 40.10
  const lng = -75.30 + (hash % 300) / 1000; // Range: -75.30 - -75.00
  
  return { lat, lng };
}

// Geocoding utility with debouncing
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const provider = import.meta.env.VITE_GEOCODE_PROVIDER;
  
  if (provider === "nominatim") {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const results = await response.json();
      
      if (results && results.length > 0) {
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon)
        };
      }
    } catch (error) {
      console.error("Nominatim geocoding failed:", error);
    }
  }
  
  // Default to pseudo coordinates
  return generatePseudoCoordinates(address);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}