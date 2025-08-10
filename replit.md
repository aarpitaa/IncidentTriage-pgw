# IncidentTriagepgw

## Overview

The AI Incident Triage Portal is a web application designed to streamline incident management by using AI to automatically classify, summarize, and provide recommendations for utility incidents. Users can input incident descriptions, and the system provides intelligent suggestions for category, severity, next steps, and customer communications. The application maintains an audit trail of changes and includes a Teams-style card preview for external communications.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite for fast development and building
- **UI Components**: Shadcn/ui component library built on Radix UI primitives for accessible, customizable components
- **Styling**: Tailwind CSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
- **Framework**: Express.js with TypeScript for API endpoints
- **Development Setup**: Custom Vite integration for seamless development experience
- **API Design**: RESTful endpoints with structured error handling and request logging
- **Validation**: Zod schemas for runtime type validation and API contract enforcement

### Database Layer
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL with Neon serverless configuration
- **Schema**: Three main entities - incidents, AI suggestions, and audit trails
- **Migration**: Drizzle Kit for database schema management and migrations

### AI Service Layer
- **Pluggable Design**: Abstract AI service interface allowing for multiple implementations
- **Fallback Strategy**: DummyAI service provides rule-based responses when LLM is unavailable
- **Integration Ready**: OpenAI API integration prepared for production LLM usage
- **Structured Output**: Standardized response format for consistent AI suggestions

### Data Model Design
- **Incidents**: Core entity storing incident details, classifications, and AI-generated content
- **AI Suggestions**: Audit trail of original AI recommendations with model metadata
- **Audit Log**: Change tracking system recording field-level modifications
- **Type Safety**: Full TypeScript integration from database to frontend with shared schemas

### Authentication & Security
- **Session Management**: Express session handling with PostgreSQL session store
- **CORS Configuration**: Configured for development and production environments
- **Input Validation**: Multi-layer validation using Zod schemas
- **Error Handling**: Structured error responses with appropriate HTTP status codes

### Development Experience
- **Hot Reload**: Vite HMR for instant frontend updates
- **Type Checking**: End-to-end TypeScript coverage with strict configuration
- **Path Mapping**: Absolute imports for cleaner code organization
- **Development Tools**: Runtime error overlay and debugging support

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: React 18 with modern hooks, React Query for state management
- **Express.js**: Node.js web framework for API development
- **TypeScript**: Full-stack type safety and development experience

### Database & ORM
- **PostgreSQL**: Primary database via Neon serverless platform
- **Drizzle ORM**: Type-safe database toolkit with migration support
- **Connection Pooling**: Neon serverless driver for optimal connection management

### UI Component Libraries
- **Radix UI**: Headless, accessible component primitives
- **Shadcn/ui**: Pre-built component library with customizable design system
- **Tailwind CSS**: Utility-first CSS framework with custom configuration

### AI Integration
- **OpenAI API**: LLM service for intelligent incident analysis
- **Fallback System**: Local rule-based classification when AI unavailable

### Development Tooling
- **Vite**: Fast build tool and development server
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Tailwind integration

### Form & Validation
- **React Hook Form**: Performant form library with minimal re-renders
- **Zod**: Runtime type validation and schema definition
- **Hookform Resolvers**: Integration between React Hook Form and Zod

### Utility Libraries
- **Date-fns**: Date manipulation and formatting
- **Wouter**: Lightweight routing for React applications
- **Class Variance Authority**: Utility for building component variant systems
- **CLSX**: Conditional CSS class composition