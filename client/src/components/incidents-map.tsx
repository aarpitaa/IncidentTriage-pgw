import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { geocodeAddress } from "@/lib/geocoding";

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

interface Incident {
  id: number;
  address: string | null;
  description: string;
  severity: string;
  category: string;
  lat?: string | null;
  lng?: string | null;
}

export default function IncidentsMap() {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
  });

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

  const initializeMap = () => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      // Check if Leaflet is available
      if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
      }

      // Initialize icons first
      initializeLeafletIcons();

      // Philadelphia center coordinates
      const map = L.map(mapContainerRef.current, {
        center: [39.9526, -75.1652],
        zoom: 11,
        zoomControl: true,
        attributionControl: true
      });
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      mapRef.current = map;
      console.log('Map initialized successfully');
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }
  };

  const clearMarkers = () => {
    markersRef.current.forEach(marker => {
      if (mapRef.current) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];
  };

  const addIncidentMarkers = async () => {
    if (!mapRef.current) {
      console.log('Map not ready for markers');
      return;
    }

    console.log('Adding markers for incidents:', incidents.length);
    clearMarkers();
    
    // Filter incidents that have coordinates
    const incidentsWithCoords = incidents.filter(incident => 
      incident.lat && incident.lng && incident.address
    );
    
    console.log('Incidents with coordinates:', incidentsWithCoords.length);
    
    for (const incident of incidentsWithCoords) {
      try {
        const lat = parseFloat(incident.lat!);
        const lng = parseFloat(incident.lng!);
        
        console.log(`Adding marker for incident ${incident.id} at [${lat}, ${lng}]`);

        const marker = L.marker([lat, lng], {
          icon: createCustomMarker(incident.severity)
        }).addTo(mapRef.current);

        marker.bindPopup(`
          <div style="text-align: center; min-width: 200px;">
            <strong>Incident #${incident.id}</strong><br/>
            <span style="color: ${getSeverityColor(incident.severity)}; font-weight: bold;">
              ${incident.severity} Severity
            </span><br/>
            <span style="color: #666; font-size: 12px;">${incident.category}</span>
            ${incident.address ? `<br/><small style="color: #999;">${incident.address}</small>` : ''}
            ${incident.description ? `<br/><small style="margin-top: 8px; display: block;">${incident.description.substring(0, 100)}${incident.description.length > 100 ? '...' : ''}</small>` : ''}
          </div>
        `);

        markersRef.current.push(marker);
        console.log(`Successfully added marker for incident ${incident.id}`);
      } catch (error) {
        console.error(`Failed to add marker for incident ${incident.id}:`, error);
      }
    }
    
    console.log(`Total markers added: ${markersRef.current.length}`);
  };

  const geocodeAllIncidents = async () => {
    setIsGeocoding(true);
    try {
      // Clear existing markers first
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      
      // Re-add all markers
      await addIncidentMarkers();
    } finally {
      setIsGeocoding(false);
    }
  };

  const refreshMap = () => {
    console.log('Refreshing map...');
    
    // Force full refresh
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    
    // Clear markers
    markersRef.current = [];
    
    // Reinitialize after a short delay
    setTimeout(() => {
      const checkLeafletAndInit = () => {
        if (typeof L !== 'undefined') {
          initializeMap();
          // Add markers after map is initialized
          setTimeout(() => {
            if (incidents.length > 0) {
              addIncidentMarkers();
            }
          }, 500);
        } else {
          setTimeout(checkLeafletAndInit, 100);
        }
      };
      checkLeafletAndInit();
    }, 100);
  };

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 50; // 10 seconds max wait
    
    const checkLeafletAndInit = () => {
      if (typeof L !== 'undefined' && L.map) {
        console.log('Leaflet loaded, initializing map...');
        initializeMap();
        // Add markers after map initialization
        setTimeout(() => {
          if (incidents.length > 0) {
            console.log('Adding markers for', incidents.length, 'incidents');
            addIncidentMarkers();
          }
        }, 500);
      } else if (attempts < maxAttempts) {
        attempts++;
        console.log(`Waiting for Leaflet... attempt ${attempts}`);
        setTimeout(checkLeafletAndInit, 200);
      } else {
        console.error('Leaflet failed to load after maximum attempts');
      }
    };

    // Start checking immediately, no delay
    checkLeafletAndInit();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (incidents.length > 0 && mapRef.current) {
      // Clear existing markers first
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      // Add new markers
      addIncidentMarkers();
    }
  }, [incidents]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidents Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full bg-gray-100 rounded border flex items-center justify-center">
            <div className="text-center">
              <i className="fas fa-spinner fa-spin text-2xl mb-2 text-gray-400"></i>
              <p className="text-sm text-gray-500">Loading map...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const incidentsWithAddress = incidents.filter(incident => incident.address);

  if (incidentsWithAddress.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidents Map</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <i className="fas fa-map-marker-alt text-3xl mb-3 text-gray-300"></i>
            <p className="text-sm">No incidents with addresses</p>
            <p className="text-xs text-gray-400">Create an incident with an address to see it on the map</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Incidents Map</CardTitle>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">
            {incidentsWithAddress.length} incident{incidentsWithAddress.length !== 1 ? 's' : ''} with locations
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshMap} 
            disabled={isGeocoding}
          >
            {isGeocoding ? (
              <i className="fas fa-spinner fa-spin text-xs mr-1"></i>
            ) : (
              <i className="fas fa-redo text-xs mr-1"></i>
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div 
          ref={mapContainerRef} 
          className="h-80 w-full rounded border"
          style={{ minHeight: '320px' }}
        />
        <div className="flex items-center justify-center space-x-4 mt-3 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>High</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span>Medium</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Low</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}