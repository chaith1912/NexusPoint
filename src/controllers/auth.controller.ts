// src/controllers/auth.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Authentication Controller
// ─────────────────────────────────────────────────────────────────────────────
// Routes handled:
//   POST   /api/auth/register   → registerHandler
//   POST   /api/auth/login      → loginHandler
//   GET    /api/auth/me         → getMeHandler  (protected)
//
// Validation strategy:
//   express-validator chains define rules per field.
//   The `validate` helper runs them and short-circuits with 422
//   if any rule fails — controller body never executes on bad input.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import * as AuthService from '../services/auth.service';
import {
  AuthenticatedRequest,
  RegisterDto,
  LoginDto,
} from '../types/index';
import {
  sendSuccess,
  sendError,
  ValidationError,
} from '../utils/apiResponse';

// ── Validation Rule Sets ──────────────────────────────────────────────────────

/**
 * Validation rules for POST /auth/register
 * Each chain validates one field and returns a clear error message.
 */

export const registerValidation = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(), // Lowercases and removes dots in Gmail addresses

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number'),

  body('profileUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('Profile URL must be a valid URL'),
];

/**
 * Validation rules for POST /auth/login
 */

export const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// ── Validation Runner ─────────────────────────────────────────────────────────

/**
 * Checks if validation chains produced any errors.
 * If yes, formats them into our standard ValidationError shape and
 * returns a 422 response immediately — controller logic never runs.
 *
 * @returns true if validation failed (response already sent)
 * @returns false if validation passed (safe to continue)
 */

const hasValidationErrors = (req: Request, res: Response): boolean => {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    // Map express-validator errors to our ValidationError shape
    const errors: ValidationError[] = result.array().map((err) => ({
      field: err.type === 'field' ? err.path : 'unknown',
      message: err.msg,
    }));

    sendError(res, 'Validation failed', 422, errors);
    return true;
  }

  return false;
};

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new user account and returns a JWT.
 *
 * Success: 201 Created
 * Failure: 422 Validation | 409 Duplicate email | 500 Server error
 */

export const registerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ── Validate ──────────────────────────────────────────────────────
    if (hasValidationErrors(req, res)) return;

    const dto: RegisterDto = {
      fullName: req.body.fullName,
      email: req.body.email,
      password: req.body.password,
      profileUrl: req.body.profileUrl,
    };

    // ── Call Service ──────────────────────────────────────────────────
    const result = await AuthService.registerUser(dto);

    // ── Respond ───────────────────────────────────────────────────────
    sendSuccess(res, 'Account created successfully', result, 201);

  } catch (error) {
    // Pass to globalErrorHandler — handles AppError, Prisma errors, etc.
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Validates credentials and returns a JWT.
 *
 * Success: 200 OK
 * Failure: 422 Validation | 401 Invalid credentials | 403 Deactivated
 */

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ── Validate ──────────────────────────────────────────────────────
    if (hasValidationErrors(req, res)) return;

    const dto: LoginDto = {
      email: req.body.email,
      password: req.body.password,
    };

    // ── Call Service ──────────────────────────────────────────────────
    const result = await AuthService.loginUser(dto);

    // ── Respond ───────────────────────────────────────────────────────
    sendSuccess(res, 'Login successful', result, 200);

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Protected — requires valid JWT (authenticate middleware runs first).
 *
 * Success: 200 OK
 * Failure: 401 No/invalid token | 404 User not found
 */
export const getMeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // user is attached by authenticate middleware — safe to cast
    const { userId } = (req as AuthenticatedRequest).user;

    // ── Call Service ──────────────────────────────────────────────────
    const user = await AuthService.getUserProfile(userId);

    // ── Respond ───────────────────────────────────────────────────────
    sendSuccess(res, 'Profile fetched successfully', user);

  } catch (error) {
    next(error);
  }
};