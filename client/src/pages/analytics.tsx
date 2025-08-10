import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SettingsBanner from "@/components/settings-banner";
import { ThemeToggle } from "@/components/theme-toggle";
import { BarChart3, Home as HomeIcon } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

interface AnalyticsData {
  window: { from: string; to: string };
  totals: { incidents: number; audited: number };
  bySeverity: Array<{ severity: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byWeek: Array<{ weekStart: string; count: number }>;
  avgChangedFields: number;
}

export default function Analytics() {
  const [location] = useLocation();
  const [dateRange, setDateRange] = useState("30");

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/stats", dateRange],
    queryFn: async () => {
      const days = parseInt(dateRange);
      const to = new Date();
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      
      const response = await fetch(`/api/stats?${params}`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      return response.json();
    },
  });

  const exportChart = (chartId: string) => {
    const canvas = document.getElementById(chartId) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${chartId}-chart.png`;
      link.href = url;
      link.click();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Failed to Load Analytics</h2>
          <p className="text-gray-600">Please try again later.</p>
        </div>
      </div>
    );
  }

  const highSeverityCount = data.bySeverity.find(s => s.severity === "High")?.count || 0;
  const highSeverityPercent = data.totals.incidents > 0 
    ? Math.round((highSeverityCount / data.totals.incidents) * 100) 
    : 0;

  // Chart data
  const severityChartData = {
    labels: data.bySeverity.map(s => s.severity),
    datasets: [{
      label: 'Incidents',
      data: data.bySeverity.map(s => s.count),
      backgroundColor: [
        '#ef4444', // Red for High severity
        '#fbbf24', // Yellow for Medium severity
        '#22c55e'  // Green for Low severity
      ],
      borderColor: [
        '#dc2626', // Darker red border
        '#f59e0b', // Darker yellow border
        '#16a34a'  // Darker green border
      ],
      borderWidth: 2,
    }]
  };

  const weeklyChartData = {
    labels: data.byWeek.map(w => {
      const date = new Date(w.weekStart);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }),
    datasets: [{
      label: 'Incidents per Week',
      data: data.byWeek.map(w => w.count),
      borderColor: '#3b82f6', // Blue line
      backgroundColor: 'rgba(59, 130, 246, 0.1)', // Light blue fill
      pointBackgroundColor: '#ef4444', // Red points
      pointBorderColor: '#dc2626', // Darker red point border
      pointRadius: 6,
      pointHoverRadius: 8,
      tension: 0.3,
      fill: true,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#374151', // Dark gray text
          font: {
            size: 14,
            weight: 'bold'
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { 
          color: '#6b7280', // Gray text
          font: { weight: 'bold' }
        },
        grid: { 
          color: 'rgba(156, 163, 175, 0.3)', // Light gray grid
          borderColor: '#9ca3af'
        }
      },
      y: {
        ticks: { 
          color: '#6b7280', // Gray text
          font: { weight: 'bold' }
        },
        grid: { 
          color: 'rgba(156, 163, 175, 0.3)', // Light gray grid
          borderColor: '#9ca3af'
        }
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 font-sans min-h-screen transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                IncidentTriage<a 
                  href="https://www.pgworks.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary italic text-sm hover:text-primary/80 transition-colors cursor-pointer"
                >
                  pgw
                </a>
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* Navigation */}
              <nav className="hidden md:flex space-x-2">
                <Link href="/">
                  <Button 
                    variant={location === "/" ? "default" : "ghost"} 
                    size="sm" 
                    className="text-sm"
                  >
                    <HomeIcon className="h-4 w-4 mr-2" />
                    Incidents
                  </Button>
                </Link>
                <Link href="/analytics">
                  <Button 
                    variant={location === "/analytics" ? "default" : "ghost"} 
                    size="sm"
                    className="text-sm"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                </Link>
              </nav>
              
              <ThemeToggle />
              <SettingsBanner />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <div className="flex items-center space-x-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Incidents</p>
                    <p className="text-2xl font-bold">{data.totals.incidents}</p>
                  </div>
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-exclamation-triangle text-blue-600 text-sm"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">High Severity</p>
                    <p className="text-2xl font-bold">{highSeverityPercent}%</p>
                  </div>
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-fire text-red-600 text-sm"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Avg Changed Fields</p>
                    <p className="text-2xl font-bold">{data.avgChangedFields}</p>
                  </div>
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-edit text-green-600 text-sm"></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Incidents by Severity</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportChart('severity-chart')}>
                  <i className="fas fa-download mr-2"></i>
                  PNG
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Bar id="severity-chart" data={severityChartData} options={chartOptions} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Incidents per Week</CardTitle>
                <Button variant="outline" size="sm" onClick={() => exportChart('weekly-chart')}>
                  <i className="fas fa-download mr-2"></i>
                  PNG
                </Button>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Line id="weekly-chart" data={weeklyChartData} options={chartOptions} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.byCategory.map((cat) => (
                  <Badge key={cat.category} variant="outline" className="px-3 py-1">
                    {cat.category}: {cat.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}