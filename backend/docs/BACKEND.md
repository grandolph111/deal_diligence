# DealDiligence.ai Backend Documentation

## Overview

DealDiligence.ai is a deal management platform with project-based collaboration, Kanban task management, and a Virtual Data Room (VDR). This document covers the backend API implementation.

**Current Status**: Phase 1 complete (Projects, Members, Tasks, Tags)

---

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 24.x |
| Framework | Express.js | 4.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL | 16.x |
| ORM | Prisma | 5.x |
| Authentication | Auth0 | JWT RS256 |
| Validation | Zod | 3.x |

---

## Project Structure

```
backend/
├── docs/                      # Documentation
│   └── BACKEND.md            # This file
├── prisma/
│   └── schema.prisma         # Database schema
├── src/
│   ├── app.ts                # Express app configuration
│   ├── server.ts             # Server entry point
│   ├── config/
│   │   ├── index.ts          # Environment configuration
│   │   └── database.ts       # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.ts           # Auth0 JWT validation
│   │   ├── permissions.ts    # Role-based access control
│   │   └── errorHandler.ts   # Global error handling
│   ├── modules/
│   │   ├── auth/             # Authentication & user sync
│   │   ├── projects/         # Project CRUD
│   │   ├── members/          # Project membership
│   │   └── tasks/            # Kanban tasks & tags
│   ├── utils/
│   │   ├── ApiError.ts       # Custom error class
│   │   └── asyncHandler.ts   # Async route wrapper
│   └── types/
│       └── express.d.ts      # TypeScript extensions
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/dealdiligence?schema=public"

# Auth0
AUTH0_AUDIENCE=https://api.dealdiligence.ai
AUTH0_ISSUER_BASE_URL=https://YOUR_TENANT.auth0.com

# CORS
FRONTEND_URL=http://localhost:3000
```

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `NODE_ENV` | Environment: `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH0_AUDIENCE` | Auth0 API identifier |
| `AUTH0_ISSUER_BASE_URL` | Auth0 tenant URL |
| `FRONTEND_URL` | Frontend origin for CORS |

---

## NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `ts-node-dev ...` | Start development server with hot reload |
| `npm run build` | `tsc` | Compile TypeScript to JavaScript |
| `npm start` | `node dist/server.js` | Run production build |
| `npm run db:migrate` | `prisma migrate dev` | Create and run migrations |
| `npm run db:generate` | `prisma generate` | Generate Prisma client |
| `npm run db:push` | `prisma db push` | Push schema changes (no migration) |
| `npm run db:studio` | `prisma studio` | Open Prisma database GUI |
| `npm run db:local:start` | `docker run ...` | Start local PostgreSQL container |
| `npm run db:local:stop` | `docker stop ...` | Stop local PostgreSQL container |
| `npm run db:local:remove` | `docker rm ...` | Remove container and all data |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│    User     │───────│  ProjectMember  │───────│   Project   │
└─────────────┘       └─────────────────┘       └─────────────┘
      │                       │                       │
      │                       │                       │
      ▼                       ▼                       ▼
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│TaskAssignee │───────│      Task       │───────│     Tag     │
└─────────────┘       └─────────────────┘       └─────────────┘
                              │                       │
                              │                       │
                              ▼                       ▼
                      ┌─────────────────┐       ┌─────────────┐
                      │ TaskAttachment  │       │   TaskTag   │
                      └─────────────────┘       └─────────────┘
                              │
                              ▼
                      ┌─────────────────┐       ┌─────────────┐
                      │    Document     │───────│DocumentChunk│
                      └─────────────────┘       └─────────────┘
```

### Models

#### User
Synced from Auth0 on first login.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| auth0Id | String | Auth0 subject identifier |
| email | String | User email (unique) |
| name | String? | Display name |
| avatarUrl | String? | Profile picture URL |

#### Project
Container for tasks, members, and documents.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Project name |
| description | String? | Project description |

#### ProjectMember
Junction table with role-based permissions.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| projectId | UUID | Foreign key to Project |
| userId | UUID | Foreign key to User |
| role | Enum | OWNER, ADMIN, MEMBER, VIEWER |
| permissions | JSON? | Configurable access settings |
| invitedBy | UUID? | User who sent invitation |
| acceptedAt | DateTime? | When invitation was accepted |

#### Task
Kanban board task.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| projectId | UUID | Foreign key to Project |
| title | String | Task title |
| description | String? | Task description |
| status | Enum | TODO, IN_PROGRESS, IN_REVIEW, COMPLETE |
| priority | Enum | LOW, MEDIUM, HIGH, URGENT |
| riskCategory | String? | Risk classification |
| assignedDate | DateTime? | When task was assigned |
| dueDate | DateTime? | Task deadline |
| timeEstimate | Int? | Estimated minutes |
| createdById | UUID | User who created the task |

#### Tag
Project-scoped labels for tasks.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| projectId | UUID | Foreign key to Project |
| name | String | Tag name (unique per project) |
| color | String | Hex color code |

#### Document (Phase 2)
Virtual Data Room file.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| projectId | UUID | Foreign key to Project |
| name | String | File name |
| s3Key | String | S3 object key |
| mimeType | String | File MIME type |
| sizeBytes | Int | File size |
| documentType | String? | Classification (contract, financial, etc.) |
| language | String? | Detected language |
| currency | String? | Primary currency mentioned |
| region | String? | Jurisdiction/region |
| extractedText | String? | Full text for search |
| processingStatus | Enum | PENDING, PROCESSING, COMPLETE, FAILED |

#### DocumentChunk (Phase 3)
Chunked content for semantic search.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| documentId | UUID | Foreign key to Document |
| chunkIndex | Int | Order within document |
| content | String | Chunk text |
| pageNumber | Int? | Source page |
| tokenCount | Int? | Token count |
| embedding | Vector? | pgvector embedding (future) |

---

## API Reference

**Base URL**: `/api/v1`

**Authentication**: All endpoints (except `/health`) require an Auth0 JWT:
```
Authorization: Bearer <token>
```

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Server health status |

### Auth & Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/auth/me` | Yes | Get or create current user |
| PATCH | `/auth/me` | Yes | Update current user profile |

**GET /auth/me Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "auth0Id": "auth0|123",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "https://...",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### Projects

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/projects` | Yes | Any | List user's projects |
| POST | `/projects` | Yes | Any | Create project (becomes OWNER) |
| GET | `/projects/:id` | Yes | Member | Get project details |
| PATCH | `/projects/:id` | Yes | OWNER, ADMIN | Update project |
| DELETE | `/projects/:id` | Yes | OWNER | Delete project |

**POST /projects Request:**
```json
{
  "name": "Project Name",
  "description": "Optional description"
}
```

**GET /projects Response:**
```json
{
  "status": "success",
  "data": {
    "projects": [
      {
        "id": "uuid",
        "name": "Project Name",
        "description": "...",
        "role": "OWNER",
        "memberCount": 5,
        "taskCount": 12,
        "documentCount": 0,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

### Project Members

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/projects/:id/members` | Yes | Member | List members |
| POST | `/projects/:id/members/invite` | Yes | OWNER, ADMIN | Invite user |
| GET | `/projects/:id/members/:memberId` | Yes | Member | Get member details |
| PATCH | `/projects/:id/members/:memberId` | Yes | OWNER, ADMIN | Update role/permissions |
| DELETE | `/projects/:id/members/:memberId` | Yes | OWNER, ADMIN | Remove member |
| POST | `/projects/:id/members/leave` | Yes | Member | Leave project |
| POST | `/projects/:id/members/transfer-ownership` | Yes | OWNER | Transfer ownership |

**POST /projects/:id/members/invite Request:**
```json
{
  "email": "newuser@example.com",
  "role": "MEMBER",
  "permissions": {
    "canAccessKanban": true,
    "canAccessVDR": true,
    "restrictedToTags": ["tag-id-1", "tag-id-2"]
  }
}
```

### Tasks

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/projects/:id/tasks` | Yes | Member* | List tasks (with filters) |
| GET | `/projects/:id/tasks/board` | Yes | Member* | Get Kanban board view |
| POST | `/projects/:id/tasks` | Yes | MEMBER+ | Create task |
| GET | `/projects/:id/tasks/:taskId` | Yes | Member* | Get task details |
| PATCH | `/projects/:id/tasks/:taskId` | Yes | MEMBER+ | Update task |
| PATCH | `/projects/:id/tasks/:taskId/status` | Yes | MEMBER+ | Update status (drag-drop) |
| DELETE | `/projects/:id/tasks/:taskId` | Yes | MEMBER+ | Delete task |
| POST | `/projects/:id/tasks/:taskId/assignees` | Yes | MEMBER+ | Add assignee |
| DELETE | `/projects/:id/tasks/:taskId/assignees/:userId` | Yes | MEMBER+ | Remove assignee |
| POST | `/projects/:id/tasks/:taskId/tags` | Yes | MEMBER+ | Add tag to task |
| DELETE | `/projects/:id/tasks/:taskId/tags/:tagId` | Yes | MEMBER+ | Remove tag from task |

*Requires `canAccessKanban` permission for MEMBER/VIEWER roles

**GET /projects/:id/tasks Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | Enum | Filter by status |
| priority | Enum | Filter by priority |
| assigneeId | UUID | Filter by assignee |
| tagId | UUID | Filter by tag |
| search | String | Search title/description |
| dueBefore | DateTime | Due date before |
| dueAfter | DateTime | Due date after |

**POST /projects/:id/tasks Request:**
```json
{
  "title": "Task title",
  "description": "Task description",
  "status": "TODO",
  "priority": "HIGH",
  "riskCategory": "Financial",
  "dueDate": "2024-12-31T23:59:59Z",
  "timeEstimate": 120,
  "assigneeIds": ["user-uuid-1", "user-uuid-2"],
  "tagIds": ["tag-uuid-1"]
}
```

**GET /projects/:id/tasks/board Response:**
```json
{
  "status": "success",
  "data": {
    "board": {
      "TODO": [...tasks],
      "IN_PROGRESS": [...tasks],
      "IN_REVIEW": [...tasks],
      "COMPLETE": [...tasks]
    }
  }
}
```

### Tags

| Method | Endpoint | Auth | Roles | Description |
|--------|----------|------|-------|-------------|
| GET | `/projects/:id/tags` | Yes | Member* | List project tags |
| POST | `/projects/:id/tags` | Yes | MEMBER+ | Create tag |
| DELETE | `/projects/:id/tags/:tagId` | Yes | ADMIN+ | Delete tag |

**POST /projects/:id/tags Request:**
```json
{
  "name": "Urgent",
  "color": "#EF4444"
}
```

---

## Role-Based Access Control

### Role Hierarchy

```
OWNER (4) > ADMIN (3) > MEMBER (2) > VIEWER (1)
```

### Permission Matrix

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|--------|:-----:|:-----:|:------:|:------:|
| Delete project | ✅ | ❌ | ❌ | ❌ |
| Update project | ✅ | ✅ | ❌ | ❌ |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Remove members | ✅ | ✅ | ❌ | ❌ |
| Change roles | ✅ | ✅* | ❌ | ❌ |
| Create/edit tasks | ✅ | ✅ | ✅** | ❌ |
| View tasks | ✅ | ✅ | ✅** | ✅** |
| Create tags | ✅ | ✅ | ✅ | ❌ |
| Delete tags | ✅ | ✅ | ❌ | ❌ |

*ADMIN cannot change OWNER role or modify other ADMINs
**Subject to `permissions` JSON configuration

### Configurable Permissions

For MEMBER and VIEWER roles, granular access is controlled via the `permissions` JSON field:

```typescript
interface MemberPermissions {
  canAccessKanban: boolean;      // Can view Kanban board
  canAccessVDR: boolean;         // Can view Virtual Data Room
  restrictedToTags?: string[];   // Only see tasks with these tags
  restrictedFolders?: string[];  // Only see docs in these folders (Phase 2)
}
```

---

## Error Handling

### Error Response Format

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "stack": "..." // Development only
}
```

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Validation failed, invalid input |
| 401 | Unauthorized | Missing or invalid JWT |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry |
| 500 | Internal Error | Server error |

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request body validation failed |
| `INVALID_TOKEN` | JWT is invalid or expired |
| `DUPLICATE_ENTRY` | Unique constraint violation |
| `NOT_FOUND` | Resource not found |
| `INVALID_REFERENCE` | Foreign key constraint violation |
| `ROUTE_NOT_FOUND` | Endpoint doesn't exist |

---

## Setup Guide

### Prerequisites

- Node.js 24.x
- Docker (for local PostgreSQL)
- Auth0 account

### Installation

```bash
# Clone and navigate to backend
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
# - Set DATABASE_URL
# - Set AUTH0_AUDIENCE and AUTH0_ISSUER_BASE_URL

# Start local database
npm run db:local:start

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

### Auth0 Setup

1. Create an Auth0 account at https://auth0.com
2. Create a new API:
   - Name: `DealDiligence API`
   - Identifier: `https://api.dealdiligence.ai` (use as `AUTH0_AUDIENCE`)
3. Create a new Application (Single Page Application) for your frontend
4. Note your tenant domain (use as `AUTH0_ISSUER_BASE_URL`)

---

## Future Phases

### Phase 2: Virtual Data Room
- S3 integration for file storage
- Document upload with presigned URLs
- Basic text extraction
- File metadata and dashboard
- Document search (full-text)

### Phase 3: AI-Powered Search
- pgvector extension for embeddings
- Document chunking pipeline
- OpenAI/Cohere embedding generation
- Semantic search implementation
- RAG for document Q&A

---

## Contributing

### Code Style

- Use TypeScript strict mode
- Validate all inputs with Zod
- Use async/await with asyncHandler wrapper
- Throw ApiError for expected errors
- Keep controllers thin, business logic in services

### Adding a New Module

1. Create folder in `src/modules/<name>/`
2. Create files:
   - `<name>.validators.ts` - Zod schemas
   - `<name>.service.ts` - Business logic
   - `<name>.controller.ts` - Route handlers
   - `<name>.routes.ts` - Express router
3. Import and mount routes in `src/app.ts`
4. Update this documentation

---

*Last updated: January 2025*
