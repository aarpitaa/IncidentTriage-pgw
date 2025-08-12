import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { MapPin, Play, Pause, Download, BarChart3, AlertTriangle, Settings, Zap } from "lucide-react";
import dayjs from "dayjs";
import L from "leaflet";
import { apiRequest } from "@/lib/queryClient";

// Leaflet imports
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface RiskBounds {
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  center: { lat: number; lng: number };
  zoom: number;
}

interface RiskIncident {
  id: number;
  lat: number;
  lng: number;
  category: string;
  severity: string;
  occurredAt: string;
}

interface RiskRepair {
  id: number;
  lat: number;
  lng: number;
  status: string;
  openedAt: string;
  closedAt?: string;
}

interface RiskPipeline {
  id: number;
  pathGeojson: {
    type: string;
    coordinates: number[][];
  };
  installYear: number;
  material: string;
}

interface RiskWeather {
  id: number;
  lat: number;
  lng: number;
  tempC?: number;
  windKph?: number;
  precipMm?: number;
  observedAt: string;
}

interface RiskZone {
  id: string;
  centerLat: number;
  centerLng: number;
  score: number;
  reasons: string[];
}

interface RiskPointsData {
  incidents?: RiskIncident[];
  repairs?: RiskRepair[];
  weather?: RiskWeather[];
}

export function RiskMapPage() {
  const [map, setMap] = useState<L.Map | null>(null);
  const [heatmapLayer, setHeatmapLayer] = useState<any>(null);
  const [markersLayer, setMarkersLayer] = useState<L.LayerGroup | null>(null);
  const [topZones, setTopZones] = useState<RiskZone[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeWindow, setCurrentTimeWindow] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // State for controls
  const [dateRange, setDateRange] = useState('30d');
  const [layers, setLayers] = useState({
    incidents: true,
    repairs: true,
    pipelines: true,
    weather: false,
    heatmap: true
  });
  const [severityFilter, setSeverityFilter] = useState(['High', 'Medium', 'Low']);
  const [nlQuestion, setNlQuestion] = useState('What are the top 3 zones to inspect this week?');
  const [nlAnswer, setNlAnswer] = useState('');

  // Calculate date range
  const getDateRange = (range: string) => {
    const now = dayjs();
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return {
      from: now.subtract(days, 'day').toISOString(),
      to: now.toISOString()
    };
  };

  // Fetch map bounds
  const { data: bounds } = useQuery<RiskBounds>({
    queryKey: ['/api/riskmap/bounds'],
    staleTime: Infinity
  });

  // Fetch risk data
  const { data: riskData, isLoading: isLoadingPoints } = useQuery<RiskPointsData>({
    queryKey: ['/api/riskmap/points', dateRange, layers, severityFilter],
    queryFn: () => {
      const { from, to } = getDateRange(dateRange);
      const activeLayers = Object.entries(layers)
        .filter(([_, active]) => active && _ !== 'heatmap')
        .map(([layer]) => layer)
        .join(',');
      
      return apiRequest(`/api/riskmap/points?from=${from}&to=${to}&layers=${activeLayers}&severity=${severityFilter.join(',')}`);
    },
    enabled: !!bounds
  });

  // Fetch pipelines
  const { data: pipelinesData } = useQuery<{ pipelines: RiskPipeline[] }>({
    queryKey: ['/api/riskmap/pipelines'],
    enabled: layers.pipelines
  });

  // Compute top zones mutation
  const topZonesMutation = useMutation({
    mutationFn: async () => {
      const { from, to } = getDateRange(dateRange);
      return apiRequest(`/api/riskmap/topzones?from=${from}&to=${to}&count=3`);
    },
    onSuccess: (data) => {
      setTopZones(data.zones || []);
    }
  });

  // Ask question mutation
  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      const { from, to } = getDateRange(dateRange);
      return apiRequest('/api/riskmap/ask', {
        method: 'POST',
        body: JSON.stringify({ question, from, to }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      setNlAnswer(data.answer || '');
    }
  });

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !bounds || map) return;

    const leafletMap = L.map(mapRef.current).setView(
      [bounds.center.lat, bounds.center.lng],
      bounds.zoom
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(leafletMap);

    const markers = L.layerGroup().addTo(leafletMap);
    
    setMap(leafletMap);
    setMarkersLayer(markers);

    return () => {
      leafletMap.remove();
    };
  }, [bounds]);

  // Update map layers when data changes
  useEffect(() => {
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // Remove existing heatmap
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
      setHeatmapLayer(null);
    }

    const heatPoints: [number, number, number][] = [];

    // Add incident markers and heat points
    if (riskData?.incidents && layers.incidents) {
      riskData.incidents.forEach(incident => {
        const color = incident.severity === 'High' ? '#ef4444' : 
                     incident.severity === 'Medium' ? '#f97316' : '#84cc16';
        
        const marker = L.circleMarker([incident.lat, incident.lng], {
          radius: incident.severity === 'High' ? 8 : incident.severity === 'Medium' ? 6 : 4,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).bindPopup(`
          <strong>${incident.severity} ${incident.category}</strong><br>
          ${dayjs(incident.occurredAt).format('MMM D, YYYY HH:mm')}
        `);
        
        markersLayer.addLayer(marker);

        // Add to heatmap
        const weight = incident.severity === 'High' ? 1.0 : 
                      incident.severity === 'Medium' ? 0.7 : 0.4;
        heatPoints.push([incident.lat, incident.lng, weight]);
      });
    }

    // Add repair markers
    if (riskData?.repairs && layers.repairs) {
      riskData.repairs.forEach(repair => {
        const color = repair.status === 'Open' ? '#dc2626' : 
                     repair.status === 'InProgress' ? '#ea580c' : '#16a34a';
        
        const marker = L.marker([repair.lat, repair.lng], {
          icon: L.divIcon({
            className: 'repair-marker',
            html: `<div style="background-color: ${color}; border-radius: 50%; width: 12px; height: 12px; border: 2px solid white;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).bindPopup(`
          <strong>Repair - ${repair.status}</strong><br>
          Opened: ${dayjs(repair.openedAt).format('MMM D, YYYY')}<br>
          ${repair.closedAt ? `Closed: ${dayjs(repair.closedAt).format('MMM D, YYYY')}` : ''}
        `);
        
        markersLayer.addLayer(marker);
      });
    }

    // Add weather markers
    if (riskData?.weather && layers.weather) {
      riskData.weather.forEach(weather => {
        const marker = L.circleMarker([weather.lat, weather.lng], {
          radius: 3,
          fillColor: '#6b7280',
          color: '#6b7280',
          weight: 1,
          opacity: 0.6,
          fillOpacity: 0.4
        }).bindPopup(`
          <strong>Weather</strong><br>
          Temp: ${weather.tempC}°C<br>
          Wind: ${weather.windKph} km/h<br>
          Precip: ${weather.precipMm}mm<br>
          ${dayjs(weather.observedAt).format('MMM D, YYYY HH:mm')}
        `);
        
        markersLayer.addLayer(marker);
      });
    }

    // Add pipeline layers
    if (pipelinesData?.pipelines && layers.pipelines) {
      pipelinesData.pipelines.forEach(pipeline => {
        const age = 2024 - pipeline.installYear;
        const weight = age > 40 ? 4 : age > 20 ? 3 : 2;
        const color = age > 40 ? '#dc2626' : age > 20 ? '#ea580c' : '#16a34a';
        
        const polyline = L.polyline(
          pipeline.pathGeojson.coordinates.map(coord => [coord[1], coord[0]]),
          {
            color: color,
            weight: weight,
            opacity: 0.8
          }
        ).bindPopup(`
          <strong>Pipeline</strong><br>
          Material: ${pipeline.material}<br>
          Installed: ${pipeline.installYear}<br>
          Age: ${age} years
        `);
        
        markersLayer.addLayer(polyline);
      });
    }

    // Add heatmap
    if (layers.heatmap && heatPoints.length > 0) {
      const heat = (L as any).heatLayer(heatPoints, {
        radius: 20,
        blur: 15,
        maxZoom: 17,
        gradient: {
          0.0: 'blue',
          0.2: 'cyan',
          0.4: 'lime',
          0.6: 'yellow',
          0.8: 'orange',
          1.0: 'red'
        }
      });
      
      map.addLayer(heat);
      setHeatmapLayer(heat);
    }

    // Add top zones if available
    topZones.forEach((zone, index) => {
      const zoneMarker = L.rectangle(
        [
          [zone.centerLat - 0.005, zone.centerLng - 0.005],
          [zone.centerLat + 0.005, zone.centerLng + 0.005]
        ],
        {
          color: '#fbbf24',
          weight: 3,
          opacity: 0.8,
          fillOpacity: 0.2
        }
      ).bindPopup(`
        <strong>Risk Zone #${index + 1}</strong><br>
        Score: ${zone.score}<br>
        ${zone.reasons.join('<br>')}
      `);
      
      markersLayer.addLayer(zoneMarker);

      // Add zone label
      const labelMarker = L.marker([zone.centerLat, zone.centerLng], {
        icon: L.divIcon({
          className: 'zone-label',
          html: `<div style="background: #fbbf24; color: black; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 12px;">#${index + 1}</div>`,
          iconSize: [30, 20],
          iconAnchor: [15, 10]
        })
      });
      
      markersLayer.addLayer(labelMarker);
    });

  }, [map, markersLayer, riskData, pipelinesData, layers, topZones]);

  const handleComputeTopZones = () => {
    topZonesMutation.mutate();
  };

  const handleAskQuestion = () => {
    if (nlQuestion.trim()) {
      askMutation.mutate(nlQuestion);
    }
  };

  const handleExportPNG = () => {
    // Simple implementation - could be enhanced with leaflet-easyPrint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx && mapRef.current) {
      // This is a simplified export - in production you'd use a proper library
      alert('Export feature would be implemented with leaflet-easyPrint or html2canvas');
    }
  };

  const totalPoints = (riskData?.incidents?.length || 0) + 
                     (riskData?.repairs?.length || 0) + 
                     (riskData?.weather?.length || 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">City Risk Map Simulator</h1>
          <p className="text-muted-foreground">
            Visualize and analyze utility infrastructure risks across the city
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Date Range */}
                <div>
                  <Label className="text-sm font-medium">Date Range</Label>
                  <div className="flex gap-2 mt-2">
                    {['7d', '30d', '90d'].map(range => (
                      <Button
                        key={range}
                        variant={dateRange === range ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDateRange(range)}
                      >
                        {range}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Layer Toggles */}
                <div>
                  <Label className="text-sm font-medium">Layers</Label>
                  <div className="space-y-3 mt-2">
                    {Object.entries(layers).map(([layer, enabled]) => (
                      <div key={layer} className="flex items-center justify-between">
                        <Label className="text-sm capitalize">{layer}</Label>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            setLayers(prev => ({ ...prev, [layer]: checked }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Severity Filter */}
                <div>
                  <Label className="text-sm font-medium">Severity Filter</Label>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {['High', 'Medium', 'Low'].map(severity => (
                      <Badge
                        key={severity}
                        variant={severityFilter.includes(severity) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          setSeverityFilter(prev =>
                            prev.includes(severity)
                              ? prev.filter(s => s !== severity)
                              : [...prev, severity]
                          );
                        }}
                      >
                        {severity}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Top Zones */}
                <div>
                  <Button
                    onClick={handleComputeTopZones}
                    disabled={topZonesMutation.isPending}
                    className="w-full"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Compute Top 3 Zones
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* NL Query */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Ask the Map
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={nlQuestion}
                  onChange={(e) => setNlQuestion(e.target.value)}
                  placeholder="What are the top 3 zones to inspect this week?"
                  className="min-h-[80px]"
                />
                <Button
                  onClick={handleAskQuestion}
                  disabled={askMutation.isPending}
                  className="w-full"
                >
                  Ask Question
                </Button>
                {nlAnswer && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {nlAnswer}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Zones Results */}
            {topZones.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Top Risk Zones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {topZones.map((zone, index) => (
                      <div key={zone.id} className="p-3 border rounded-md">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium">Zone #{index + 1}</span>
                          <Badge variant="destructive">
                            Score: {zone.score}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {zone.reasons.map((reason, i) => (
                            <div key={i}>• {reason}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Map */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Risk Map</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPNG}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export PNG
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Showing {totalPoints} data points • {dateRange} range
                  {isLoadingPoints && " • Loading..."}
                </div>
              </CardHeader>
              <CardContent>
                <div
                  ref={mapRef}
                  className="w-full h-[600px] rounded-md border"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}