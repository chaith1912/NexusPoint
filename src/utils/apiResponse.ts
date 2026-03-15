// src/utils/apiResponse.ts
// ─────────────────────────────────────────────────────────────────────────────
// Standardized API Response Utility
// Ensures every endpoint returns a consistent JSON shape.
// Flutter client (Module 3) depends on this contract — do not change the
// top-level keys (success, message, data, errors, meta) without updating
// the Dart models simultaneously.
// ─────────────────────────────────────────────────────────────────────────────

import { Response } from 'express';
import { ValidationError, PaginationMeta } from '../types/index';
export type { ValidationError, PaginationMeta };

/**
 * The master response envelope.
 * All fields except `success` and `message` are optional
 * so callers only attach what's relevant.
 */
interface ApiResponseBody<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: ValidationError[];
  meta?: PaginationMeta;
}

// ── Response Senders ─────────────────────────────────────────────────────────

/**
 * Send a successful response.
 *
 * @param res     - Express Response object
 * @param message - Human-readable success message
 * @param data    - Payload to return (any serializable type)
 * @param status  - HTTP status code (default: 200)
 * @param meta    - Optional pagination metadata for list endpoints
 *
 * @example
 * sendSuccess(res, 'Application created', newApplication, 201);
 */
export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  status: number = 200,
  meta?: PaginationMeta
): Response => {
  const body: ApiResponseBody<T> = {
    success: true,
    message,
    ...(data !== undefined && { data }),
    ...(meta !== undefined && { meta }),
  };

  return res.status(status).json(body);
};

/**
 * Send an error response.
 *
 * @param res     - Express Response object
 * @param message - Human-readable error message
 * @param status  - HTTP status code (default: 500)
 * @param errors  - Optional array of field-level validation errors
 *
 * @example
 * sendError(res, 'Application not found', 404);
 * sendError(res, 'Validation failed', 422, validationErrors);
 */
export const sendError = (
  res: Response,
  message: string,
  status: number = 500,
  errors?: ValidationError[]
): Response => {
  const body: ApiResponseBody = {
    success: false,
    message,
    ...(errors !== undefined && { errors }),
  };

  return res.status(status).json(body);
};

/**
 * Send a 404 Not Found response.
 * Shorthand used heavily in controllers.
 *
 * @example
 * sendNotFound(res, 'Application');
 * // → { success: false, message: "Application not found" }
 */
export const sendNotFound = (
  res: Response,
  resourceName: string = 'Resource'
): Response => {
  return sendError(res, `${resourceName} not found`, 404);
};

/**
 * Send a 401 Unauthorized response.
 * Used by auth middleware when JWT is missing or invalid.
 */
export const sendUnauthorized = (
  res: Response,
  message: string = 'Unauthorized — please log in'
): Response => {
  return sendError(res, message, 401);
};

/**
 * Send a 403 Forbidden response.
 * Used when a valid user tries to access another user's resource.
 */
export const sendForbidden = (
  res: Response,
  message: string = 'Forbidden — you do not have access to this resource'
): Response => {
  return sendError(res, message, 403);
};
