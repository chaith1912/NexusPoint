// src/middleware/error.middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler Middleware
// ─────────────────────────────────────────────────────────────────────────────
// Must be registered LAST in app.ts (after all routes) to catch errors
// passed via next(error) or unhandled throws.
//
// Handles:
//   - Prisma known errors   (P2002 unique violation, P2025 not found, etc.)
//   - Prisma unknown errors (connection failures, timeouts)
//   - JWT errors            (in case they escape auth middleware)
//   - Validation errors     (express-validator)
//   - Generic JS errors     (TypeError, RangeError, etc.)
//   - Unknown throws        (strings, objects thrown accidentally)
//
// Security:
//   - Stack traces ONLY logged to server console, never sent to client
//   - Prisma error codes mapped to safe user-facing messages
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/apiResponse';

// ── Custom Application Error ──────────────────────────────────────────────────

/**
 * Throw this anywhere in the app to trigger a controlled error response.
 * Carries an HTTP status code alongside the message.
 *
 * Usage:
 *   throw new AppError('Email already in use', 409);
 *   throw new AppError('Application not found', 404);
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Marks it as a known/expected error

    // Maintains proper stack trace in V8 (Node.js)
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ── Prisma Error Mapper ───────────────────────────────────────────────────────

/**
 * Maps Prisma's cryptic error codes to safe, user-friendly messages.
 * Full code reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
const handlePrismaError = (
  error: Prisma.PrismaClientKnownRequestError
): { message: string; statusCode: number } => {
  switch (error.code) {

    case 'P2002': {
      // Unique constraint violation
      // error.meta.target contains the field(s) that caused it
      const fields = (error.meta?.target as string[])?.join(', ') ?? 'field';
      return {
        message: `A record with this ${fields} already exists`,
        statusCode: 409, // Conflict
      };
    }

    case 'P2025':
      // Record not found (e.g. update/delete on non-existent ID)
      return {
        message: 'Record not found',
        statusCode: 404,
      };

    case 'P2003':
      // Foreign key constraint failed
      return {
        message: 'Related record not found — check your referenced IDs',
        statusCode: 400,
      };

    case 'P2014':
      // Required relation violation
      return {
        message: 'This operation would violate a required relationship',
        statusCode: 400,
      };

    case 'P1001':
      // Cannot reach database
      return {
        message: 'Database connection failed — please try again later',
        statusCode: 503, // Service Unavailable
      };

    case 'P1008':
      // Operation timed out
      return {
        message: 'Database operation timed out — please try again',
        statusCode: 504, // Gateway Timeout
      };

    default:
      return {
        message: 'A database error occurred',
        statusCode: 500,
      };
  }
};

// ── 404 Handler ───────────────────────────────────────────────────────────────

/**
 * Catches requests to routes that don't exist.
 * Register this BEFORE the global error handler in app.ts.
 *
 * Without this, Express returns an HTML "Cannot GET /unknown-route"
 * which breaks the Flutter JSON parser.
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  sendError(
    res,
    `Route not found — ${req.method} ${req.originalUrl}`,
    404
  );
};

// ── Global Error Handler ──────────────────────────────────────────────────────

/**
 * Express global error handler.
 * MUST have exactly 4 parameters (err, req, res, next) —
 * Express identifies it as an error handler by the arity.
 *
 * Register last in app.ts:
 *   app.use(notFoundHandler);
 *   app.use(globalErrorHandler);  ← always last
 */
export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {

  // ── Always log the full error server-side ─────────────────────────────
  // Never send stack traces to the client
  console.error(`[Error Handler] ${req.method} ${req.originalUrl}`, err);

  // ── AppError: known, operational errors ──────────────────────────────
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // ── Prisma Known Errors ───────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const { message, statusCode } = handlePrismaError(err);
    sendError(res, message, statusCode);
    return;
  }

  // ── Prisma Unknown Errors (connection issues, config problems) ────────
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    sendError(res, 'An unexpected database error occurred', 500);
    return;
  }

  // ── Prisma Initialization Errors ──────────────────────────────────────
  if (err instanceof Prisma.PrismaClientInitializationError) {
    sendError(res, 'Database initialization failed', 503);
    return;
  }

  // ── JWT Errors (escaped auth middleware) ─────────────────────────────
  if (err instanceof jwt.TokenExpiredError) {
    sendError(res, 'Session expired — please log in again', 401);
    return;
  }

  if (err instanceof jwt.JsonWebTokenError) {
    sendError(res, 'Invalid token', 401);
    return;
  }

  // ── Standard JS Errors ───────────────────────────────────────────────
  if (err instanceof Error) {
    // In development, include the real message for easier debugging
    const message =
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred';

    sendError(res, message, 500);
    return;
  }

  // ── Unknown throw type (string, object, etc.) ─────────────────────────
  sendError(res, 'An unexpected error occurred', 500);
};