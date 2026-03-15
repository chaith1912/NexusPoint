// src/middleware/auth.middleware.ts
// ─────────────────────────────────────────────────────────────────────────────
// JWT Authentication Middleware
// ─────────────────────────────────────────────────────────────────────────────
// Protects routes by validating Bearer tokens on every incoming request.
//
// Flow:
//   1. Extract token from Authorization header
//   2. Verify signature + expiry using JWT_SECRET
//   3. Attach decoded payload to req.user
//   4. Call next() to proceed to the controller
//
// Failure cases handled:
//   - No Authorization header         → 401
//   - Wrong format (not Bearer)       → 401
//   - Token expired                   → 401 (distinct message)
//   - Token signature invalid         → 401 (distinct message)
//   - JWT_SECRET not set in .env      → 500 (config error)
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  JwtPayload,
  AuthenticatedRequest,
} from '../types/index';
import {
  sendUnauthorized,
  sendError,
} from '../utils/apiResponse';

// ── Main Middleware ───────────────────────────────────────────────────────────

/**
 * Validates the JWT Bearer token on protected routes.
 * Attach to any route that requires authentication.
 *
 * Usage in routes:
 *   router.get('/applications', authenticate, applicationController.getAll);
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {

  // ── Step 1: Check Authorization header exists ───────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    sendUnauthorized(res, 'No authorization header provided');
    return;
  }

  // ── Step 2: Validate Bearer format ─────────────────────────────────────
  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    sendUnauthorized(
      res,
      'Invalid authorization format — expected: Bearer <token>'
    );
    return;
  }

  const token = parts[1];

  // ── Step 3: Ensure JWT_SECRET is configured ─────────────────────────────
  // Defensive: catch misconfigured environments early with a clear 500
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('[Auth Middleware] FATAL: JWT_SECRET is not set in .env');
    sendError(res, 'Server configuration error', 500);
    return;
  }

  // ── Step 4: Verify token ────────────────────────────────────────────────
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach decoded payload to request — accessible in all downstream handlers
    (req as AuthenticatedRequest).user = decoded;

    next(); // ✅ Token valid — proceed to controller

  } catch (error) {

    // Distinguish between expiry and tampering for better client UX
    if (error instanceof jwt.TokenExpiredError) {
      sendUnauthorized(res, 'Session expired — please log in again');
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      sendUnauthorized(res, 'Invalid token — please log in again');
      return;
    }

    // Unexpected error (shouldn't happen, but never trust jwt blindly)
    console.error('[Auth Middleware] Unexpected JWT error:', error);
    sendError(res, 'Authentication failed', 500);
  }
};

// ── Optional: Resource Ownership Guard ───────────────────────────────────────

/**
 * Verifies the authenticated user owns the resource they're requesting.
 * Use AFTER authenticate middleware on routes with a :userId param.
 *
 * Usage:
 *   router.get('/users/:userId/resumes', authenticate, requireOwnership, ...)
 *
 * Note: This is a simple param-based check. Controller-level ownership checks
 * (e.g. application belongs to user) are handled in the service layer.
 */
export const requireOwnership = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { userId } = (req as AuthenticatedRequest).user;
  const requestedUserId = req.params.userId;

  if (requestedUserId && requestedUserId !== userId) {
    sendUnauthorized(
      res,
      'Forbidden — you do not have access to this resource'
    );
    return;
  }

  next();
};