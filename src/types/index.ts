// src/types/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript Types & Interfaces
// All types used across more than one file live here.
// Controllers, services, and middleware all import from this file.
// ─────────────────────────────────────────────────────────────────────────────

import { Request } from 'express';
import {
  ApplicationStatus,
  ApplicationSource,
  ResumeFormat,
} from '@prisma/client';

// Re-export Prisma enums so the rest of the app imports from one place
// instead of mixing @prisma/client imports everywhere
export { ApplicationStatus, ApplicationSource, ResumeFormat };

// ── JWT ───────────────────────────────────────────────────────────────────────

/**
 * Shape of the payload encoded inside every JWT access token.
 * Keep this minimal — JWTs are sent with every request.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number; // Issued at (auto-added by jsonwebtoken)
  exp?: number; // Expiry  (auto-added by jsonwebtoken)
}

// ── Authenticated Request ─────────────────────────────────────────────────────

/**
 * Extends Express's Request to include the decoded JWT user.
 * Every protected route handler receives this type instead of plain Request.
 *
 * Usage in controllers:
 *   const { userId } = (req as AuthenticatedRequest).user;
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// ── Auth DTOs (Data Transfer Objects) ────────────────────────────────────────

/**
 * Body shape expected by POST /auth/register
 */
export interface RegisterDto {
  fullName: string;
  email: string;
  password: string;
  profileUrl?: string;
}

/**
 * Body shape expected by POST /auth/login
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * Shape returned to the client after successful auth.
 * Never include passwordHash here.
 */
export interface AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    profileUrl: string | null;
    createdAt: Date;
  };
}

// ── Application DTOs ──────────────────────────────────────────────────────────

/**
 * Body shape expected by POST /applications
 */
export interface CreateApplicationDto {
  jobTitle: string;
  companyName: string;
  jobUrl?: string;
  jobDescription?: string;
  location?: string;
  salaryRange?: string;
  status?: ApplicationStatus;
  source?: ApplicationSource;
  appliedAt?: string;       // ISO date string from client
  nextFollowUpDate?: string;
  notes?: string;
  contactName?: string;
  contactEmail?: string;
  resumeId?: string;
}

/**
 * Body shape expected by PATCH /applications/:id
 * All fields optional — client sends only what changed.
 */
export interface UpdateApplicationDto extends Partial<CreateApplicationDto> {}

/**
 * Query params for GET /applications (filtering + pagination)
 */
export interface ApplicationQueryParams {
  status?: ApplicationStatus;
  source?: ApplicationSource;
  companyName?: string;
  page?: string;            // String because query params are always strings
  pageSize?: string;
}

// ── Resume DTOs ───────────────────────────────────────────────────────────────

/**
 * Body shape expected by POST /resumes
 * File itself is handled by multer middleware — this covers metadata.
 */
export interface CreateResumeDto {
  label: string;
  format: ResumeFormat;
  isDefault?: boolean;
}

// ── Environment ───────────────────────────────────────────────────────────────

/**
 * Typed wrapper for process.env
 * Prevents runtime crashes from undefined env variables.
 * Validated at app startup in app.ts.
 */
export interface EnvironmentVariables {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

/**
 * Shape of a single field-level validation error.
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Pagination metadata attached to list responses.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}