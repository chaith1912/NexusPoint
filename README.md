Create a professional README.md file for my project at:
C:\Users\Chaithanya R Rao\Desktop\nexuspoint-api

The README should cover the following:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: NexusPoint
Type: Candidate-Side Applicant Tracking System (ATS) & Job Search CRM
Purpose: Track job applications across platforms like LinkedIn,
         Internshala, Naukri, Indeed and company career pages

This is Module 1 of a 4-module system:
- Module 1: Core API & Database (Node.js + PostgreSQL + Prisma) ✅
- Module 2: Smart Ingestion Service (Chrome Extension MV3) 🔄
- Module 3: Cross-Platform Dashboard (Flutter) 🔄
- Module 4: AI Fallback Service (Python + FastAPI) 🔄

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Runtime:    Node.js LTS
- Language:   TypeScript (strict mode)
- Framework:  Express.js
- ORM:        Prisma
- Database:   PostgreSQL 18
- Auth:       JWT + bcryptjs
- Validation: express-validator
- Security:   Helmet, CORS, express-rate-limit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexuspoint-api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── config/
│   │   └── database.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── application.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   └── application.routes.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── application.service.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── apiResponse.ts
│   └── app.ts
├── .env
├── package.json
└── tsconfig.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE MODELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- User         (id, email, fullName, passwordHash, profileUrl, isActive)
- Application  (id, userId, jobTitle, companyName, jobUrl,
                jobDescription, location, salaryRange, status,
                source, appliedAt, nextFollowUpDate, notes,
                contactName, contactEmail, aiParsedKeywords,
                aiMatchScore, resumeId, createdAt, updatedAt)
- ApplicationStatusHistory (id, applicationId, fromStatus,
                            toStatus, changedAt, note)
- Resume       (id, userId, label, filePath, format,
                fileSizeKb, isDefault, parsedText, parsedSkills)

ApplicationStatus enum:
BOOKMARKED, APPLIED, ASSESSMENT, INTERVIEW_ROUND,
OFFER, REJECTED, WITHDRAWN, GHOSTED

ApplicationSource enum:
LINKEDIN, INTERNSHALA, NAUKRI, INDEED,
COMPANY_WEBSITE, REFERRAL, OTHER

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API ENDPOINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Health:
  GET  /health

Auth (public):
  POST /api/auth/register
  POST /api/auth/login

Auth (protected):
  GET  /api/auth/me

Applications (all protected):
  GET    /api/applications
  POST   /api/applications
  GET    /api/applications/:id
  PATCH  /api/applications/:id
  DELETE /api/applications/:id

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENT VARIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE_URL="postgresql://postgres:password@localhost:5432/nexuspoint_db"
JWT_SECRET="minimum-32-characters-long-secret"
PORT=3001
NODE_ENV="development"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GETTING STARTED COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NPM SCRIPTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
npm run dev          → Start dev server with nodemon
npm run build        → Compile TypeScript to dist/
npm run start        → Run compiled production build
npm run prisma:studio → Open Prisma Studio (visual DB browser)
npm run prisma:migrate → Run database migrations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECURITY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- bcrypt password hashing (12 rounds)
- JWT authentication (7 day expiry)
- Helmet HTTP security headers
- Rate limiting (200/15min global, 20/15min auth)
- User enumeration prevention
- Ownership guards on all application endpoints
- Environment validation on startup
- Graceful shutdown handling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All endpoints return this consistent envelope:

Success:
{
  "success": true,
  "message": "Human readable message",
  "data": { ... },
  "meta": { "page": 1, "pageSize": 10, "total": 42, "totalPages": 5 }
}

Error:
{
  "success": false,
  "message": "Human readable error",
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
README FORMATTING REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use proper GitHub flavored markdown
- Include badges at the top:
  Node.js, TypeScript, PostgreSQL, Prisma, Express
- Use tables for API endpoints and environment variables
- Use code blocks for all commands and JSON examples
- Include a Table of Contents
- Professional tone
- Save the file as README.md in the project root
