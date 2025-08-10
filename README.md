# IncidentTriagepgw

**A comprehensive AI-powered incident triage portal for utility companies with intelligent classification, interactive mapping, and real-time analytics.**

## 🚀 Overview

IncidentTriagepgw is a modern web application designed to streamline utility incident management through AI-powered automation. The system helps utility company agents quickly classify customer incidents, generate intelligent responses, track resolution progress, and visualize incident data through interactive maps and analytics dashboards.

## ✨ Key Features

### 🤖 AI-Powered Classification
- **Intelligent Incident Analysis**: Automatically categorizes incidents (Electrical, Gas, Water, Billing, etc.)
- **Severity Assessment**: AI determines incident severity levels (High, Medium, Low)
- **Smart Summaries**: Generates concise incident summaries from detailed descriptions
- **Response Suggestions**: Provides next steps and customer communication templates
- **Dual AI Backend**: Uses OpenAI for production with DummyAI fallback for development

### 🗺️ Interactive Mapping
- **Real-time Incident Visualization**: View all incidents with location data on interactive maps
- **Address Autocomplete**: Smart address suggestions using OpenStreetMap
- **Geocoding Integration**: Automatic coordinate resolution for addresses
- **Severity-based Markers**: Color-coded markers (Red=High, Yellow=Medium, Green=Low)
- **Clickable Popups**: Detailed incident information on marker click

### 📊 Analytics Dashboard
- **Interactive Charts**: Incident statistics with Chart.js integration
- **Data Export**: Export analytics data to CSV format
- **Trend Analysis**: Visual representation of incident patterns
- **Real-time Updates**: Live data synchronization with the database

### 🎨 Modern UI/UX
- **Dark/Light Mode**: Persistent theme preferences with system detection
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Accessible Components**: Built with Radix UI primitives
- **Professional Styling**: Modern design with Tailwind CSS
- **Teams Integration**: Card previews for sharing incidents in Microsoft Teams

### 🔒 Enterprise Features
- **Audit Trail**: Complete change tracking for compliance
- **Session Management**: Secure user authentication and session handling
- **Data Persistence**: PostgreSQL database with full CRUD operations
- **Type Safety**: End-to-end TypeScript coverage
- **Error Handling**: Comprehensive error management and recovery

## 🛠️ Technology Stack

### Frontend
- **React 18** - Modern UI framework with hooks
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first styling
- **Shadcn/ui** - High-quality component library
- **TanStack Query** - Powerful data synchronization
- **React Hook Form** - Performant form management
- **Leaflet** - Interactive mapping library

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **TypeScript** - Server-side type safety
- **PostgreSQL** - Robust relational database
- **Drizzle ORM** - Type-safe database operations
- **OpenAI API** - AI-powered incident analysis
- **Zod** - Runtime type validation

### Development Tools
- **ESBuild** - Fast JavaScript bundler
- **PostCSS** - CSS processing
- **Drizzle Kit** - Database migrations
- **Hot Module Replacement** - Instant development feedback

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (or use Neon serverless)
- OpenAI API key (optional, falls back to DummyAI)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/IncidentTriagepgw.git
   cd IncidentTriagepgw
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Configure your `.env` file:
   ```
   DATABASE_URL=your_postgresql_connection_string
   OPENAI_API_KEY=your_openai_api_key (optional)
   USE_OPENAI=true (set to false to use DummyAI)
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:5000`

## 📖 Usage Guide

### Creating Incidents
1. Fill out the incident form with description and address
2. Use address autocomplete for accurate location data
3. Click "Generate Report" to get AI-powered classification
4. Review and save the incident

### Viewing Maps
- **Main Map**: Shows all incidents with location markers
- **Individual Maps**: Appear for specific incidents with coordinates
- **Marker Colors**: Red (High), Yellow (Medium), Green (Low severity)
- **Interactive**: Click markers for detailed incident information

### Analytics Dashboard
1. Navigate to the Analytics page
2. View incident statistics in interactive charts
3. Export data using the "Export CSV" button
4. Filter by date ranges and categories

### Theme Switching
- Use the theme toggle in the header
- Preferences persist across sessions
- Automatic system theme detection

## 🔧 Configuration

### AI Service Configuration
The application supports both OpenAI and a fallback DummyAI service:

```typescript
// Use OpenAI (requires API key)
USE_OPENAI=true
OPENAI_API_KEY=your_key_here

// Use DummyAI (no API key required)
USE_OPENAI=false
```

### Database Configuration
Supports PostgreSQL with connection pooling:

```typescript
DATABASE_URL=postgresql://user:password@host:port/database
```

## 🌟 Future Roadmap

### Mobile Application
- **React Native App**: Native iOS and Android applications
- **Offline Capabilities**: Work without internet connectivity
- **Push Notifications**: Real-time incident alerts
- **GPS Integration**: Automatic location detection for field agents
- **Camera Integration**: Photo attachments for incident documentation

### Advanced AI Features
- **Predictive Analytics**: Forecast incident patterns and resource needs
- **Natural Language Processing**: Voice-to-text incident reporting
- **Image Recognition**: Automatic incident classification from photos
- **Multi-language Support**: International deployment capabilities

### Enterprise Integrations
- **Slack/Teams Bots**: Direct incident reporting through chat platforms
- **Salesforce Integration**: CRM synchronization for customer management
- **GIS Integration**: Advanced mapping with ArcGIS or Google Maps Platform
- **SCADA Integration**: Real-time utility system monitoring
- **Ticketing Systems**: Integration with Jira, ServiceNow, etc.

### Advanced Features
- **Real-time Collaboration**: Multiple agents working on incidents simultaneously
- **Advanced Reporting**: Comprehensive incident analytics and reporting
- **Custom Workflows**: Configurable incident resolution processes
- **Role-based Access**: Granular permissions for different user types
- **API Documentation**: OpenAPI/Swagger documentation for third-party integrations

## 📱 Deployment Options

### Production Deployment
- **Vercel**: Recommended for full-stack deployment
- **Netlify**: Alternative hosting with serverless functions
- **Railway**: Easy PostgreSQL and app hosting
- **Docker**: Containerized deployment for any cloud provider

### Static Deployment (GitHub Pages)
For frontend-only deployment:
```bash
npm run build:static
# Deploy the dist folder to GitHub Pages
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation in `/docs`
- Review the troubleshooting guide

## 🏗️ Architecture

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utility functions
├── server/                 # Express backend
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Database operations
│   └── services/           # Business logic
├── shared/                 # Shared types and schemas
└── docs/                   # Documentation
```

---

**Built with ❤️ for utility companies worldwide**