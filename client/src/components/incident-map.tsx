import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { geocodeAddress } from "@/lib/geocoding";
import { useToast } from "@/hooks/use-toast";

// Import Leaflet from the global object instead of ES modules
declare const L: any;

// Initialize Leaflet icons when the component loads
const initializeLeafletIcons = () => {
  if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });
  }
};

interface IncidentMapProps {
  incident: {
    id: number;
    address: string | null;
    severity: string;
    lat?: string | null;
    lng?: string | null;
  };
  onCoordinatesUpdate?: (lat: number, lng: number) => void;
}

export default function IncidentMap({ incident, onCoordinatesUpdate }: IncidentMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const { toast } = useToast();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "High": return "#ef4444";
      case "Medium": return "#f59e0b";
      case "Low": return "#10b981";
      default: return "#6b7280";
    }
  };

  const createCustomMarker = (severity: string) => {
    const color = getSeverityColor(severity);
    
    const svgIcon = `
      <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 0C5.594 0 0 5.594 0 12.5 0 19.531 12.5 41 12.5 41S25 19.531 25 12.5C25 5.594 19.406 0 12.5 0Z" fill="${color}"/>
        <circle cx="12.5" cy="12.5" r="6" fill="white"/>
      </svg>
    `;
    
    return L.divIcon({
      html: svgIcon,
      className: 'custom-marker',
      iconSize: [25, 41],
      iconAnchor: [12.5, 41],
      popupAnchor: [0, -41]
    });
  };

  const initializeMap = (lat: number, lng: number) => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      // Check if Leaflet is available
      if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded for incident map');
        return;
      }

      // Initialize icons first
      initializeLeafletIcons();

      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 13,
        zoomControl: true,
        attributionControl: true
      });
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const marker = L.marker([lat, lng], {
        icon: createCustomMarker(incident.severity)
      }).addTo(map);

      marker.bindPopup(`
        <div style="text-align: center;">
          <strong>Incident ${incident.id}</strong><br/>
          <span style="color: ${getSeverityColor(incident.severity)}; font-weight: bold;">
            ${incident.severity} Severity
          </span>
          ${incident.address ? `<br/><small>${incident.address}</small>` : ''}
        </div>
      `);

      mapRef.current = map;
      markerRef.current = marker;
      console.log('Individual incident map initialized');
    } catch (error) {
      console.error('Failed to initialize incident map:', error);
    }
  };

  const handleGeocode = async () => {
    if (!incident.address) {
      toast({
        title: "No Address",
        description: "No address available to geocode.",
        variant: "destructive",
      });
      return;
    }

    setIsGeocoding(true);
    try {
      const coords = await geocodeAddress(incident.address);
      
      if (coords) {
        // Update map
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([coords.lat, coords.lng], 13);
          markerRef.current.setLatLng([coords.lat, coords.lng]);
        } else {
          initializeMap(coords.lat, coords.lng);
        }

        // Call update callback if provided
        if (onCoordinatesUpdate) {
          onCoordinatesUpdate(coords.lat, coords.lng);
        }

        const provider = import.meta.env.VITE_GEOCODE_PROVIDER;
        toast({
          title: "Location Found",
          description: provider === "nominatim" 
            ? "Address geocoded successfully" 
            : "Coordinates generated for demo",
        });
      } else {
        toast({
          title: "Geocoding Failed",
          description: "Could not determine location for this address.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({
        title: "Geocoding Error",
        description: "Failed to geocode address.",
        variant: "destructive",
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  useEffect(() => {
    const lat = incident.lat ? parseFloat(incident.lat) : null;
    const lng = incident.lng ? parseFloat(incident.lng) : null;

    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      initializeMap(lat, lng);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [incident.lat, incident.lng, incident.severity]);

  const hasCoordinates = incident.lat && incident.lng;

  if (!hasCoordinates && !incident.address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-map-marker-alt text-3xl mb-3 text-gray-300"></i>
            <p className="text-sm">No location available</p>
            <p className="text-xs text-gray-400">No address provided for this incident</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasCoordinates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <i className="fas fa-map-marker-alt text-3xl mb-3 text-gray-300"></i>
            <p className="text-sm text-gray-600 mb-3">Location not yet geocoded</p>
            <Button 
              size="sm" 
              onClick={handleGeocode} 
              disabled={isGeocoding}
              className="min-w-24"
            >
              {isGeocoding ? (
                <i className="fas fa-spinner fa-spin mr-2"></i>
              ) : (
                <i className="fas fa-search-location mr-2"></i>
              )}
              {isGeocoding ? "Geocoding..." : "Geocode"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Location</CardTitle>
        {incident.address && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGeocode} 
            disabled={isGeocoding}
          >
            <i className="fas fa-redo text-xs mr-1"></i>
            Re-geocode
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div 
          ref={mapContainerRef} 
          className="h-80 w-full rounded border"
          style={{ minHeight: '320px' }}
        />
        {incident.address && (
          <p className="text-xs text-gray-500 mt-2">📍 {incident.address}</p>
        )}
      </CardContent>
    </Card>
  );
}