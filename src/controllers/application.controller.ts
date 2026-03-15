// src/controllers/application.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Application CRUD Controller
// ─────────────────────────────────────────────────────────────────────────────
// Handles HTTP layer for all application endpoints.
// Validates input, calls service methods, sends standardized responses.
// All business logic and DB operations live in application.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import * as ApplicationService from '../services/application.service';
import {
  AuthenticatedRequest,
  CreateApplicationDto,
  UpdateApplicationDto,
  ApplicationQueryParams,
  ValidationError,
} from '../types/index';
import { ApplicationStatus, ApplicationSource } from '@prisma/client';
import { sendSuccess, sendError } from '../utils/apiResponse';

// ── Query String Helper ───────────────────────────────────────────────────────

/** Safely coerce a query param to string | undefined (Express types it as string | string[]). */
const qs = (val: unknown): string | undefined =>
  typeof val === 'string' ? val : undefined;

// ── Validation Helpers ────────────────────────────────────────────────────────

/**
 * Valid values for status and source enums.
 * Derived directly from Prisma enums so they stay in sync automatically.
 */
const VALID_STATUSES = Object.values(ApplicationStatus);
const VALID_SOURCES = Object.values(ApplicationSource);

/**
 * Checks validation results and sends 422 if any errors exist.
 * Returns true if validation failed (response already sent).
 * Returns false if validation passed (safe to continue).
 */
const hasValidationErrors = (req: Request, res: Response): boolean => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors: ValidationError[] = result.array().map((err) => ({
      field: err.type === 'field' ? err.path : 'unknown',
      message: err.msg,
    }));
    sendError(res, 'Validation failed', 422, errors);
    return true;
  }
  return false;
};

// ── Validation Rule Sets ──────────────────────────────────────────────────────

/**
 * Validation rules for POST /api/applications
 */
export const createValidation = [
  body('jobTitle')
    .trim()
    .notEmpty()
    .withMessage('Job title is required')
    .isLength({ max: 200 })
    .withMessage('Job title must be under 200 characters'),

  body('companyName')
    .trim()
    .notEmpty()
    .withMessage('Company name is required')
    .isLength({ max: 200 })
    .withMessage('Company name must be under 200 characters'),

  body('jobUrl')
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage('Job URL must be a valid URL'),

  body('status')
    .optional()
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`),

  body('source')
    .optional()
    .isIn(VALID_SOURCES)
    .withMessage(`Source must be one of: ${VALID_SOURCES.join(', ')}`),

  body('appliedAt')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('appliedAt must be a valid ISO 8601 date'),

  body('nextFollowUpDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('nextFollowUpDate must be a valid ISO 8601 date'),

  body('contactEmail')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('Contact email must be a valid email address'),
];

/**
 * Validation rules for PATCH /api/applications/:id
 * All fields optional — client sends only what changed.
 */
export const updateValidation = [
  body('jobTitle')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Job title cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Job title must be under 200 characters'),

  body('companyName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Company name cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Company name must be under 200 characters'),

  body('jobUrl')
    .optional({ nullable: true })
    .trim()
    .isURL()
    .withMessage('Job URL must be a valid URL'),

  body('status')
    .optional()
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`),

  body('source')
    .optional()
    .isIn(VALID_SOURCES)
    .withMessage(`Source must be one of: ${VALID_SOURCES.join(', ')}`),

  body('appliedAt')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('appliedAt must be a valid ISO 8601 date'),

  body('nextFollowUpDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('nextFollowUpDate must be a valid ISO 8601 date'),

  body('contactEmail')
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage('Contact email must be a valid email address'),
];

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/applications
 * Creates a new tracked job application.
 *
 * Success: 201 with new application object
 * Failure: 422 Validation
 */
export const createHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (hasValidationErrors(req, res)) return;

    const { userId } = (req as AuthenticatedRequest).user;

    const dto: CreateApplicationDto = {
      jobTitle: req.body.jobTitle,
      companyName: req.body.companyName,
      jobUrl: req.body.jobUrl,
      jobDescription: req.body.jobDescription,
      location: req.body.location,
      salaryRange: req.body.salaryRange,
      status: req.body.status,
      source: req.body.source,
      appliedAt: req.body.appliedAt,
      nextFollowUpDate: req.body.nextFollowUpDate,
      notes: req.body.notes,
      contactName: req.body.contactName,
      contactEmail: req.body.contactEmail,
      resumeId: req.body.resumeId,
    };

    const application = await ApplicationService.createApplication(userId, dto);

    sendSuccess(res, 'Application created successfully', application, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications
 * Returns paginated, filtered list of applications for the current user.
 *
 * Query params: status, source, companyName, page, pageSize
 * Success: 200 with applications array + pagination meta
 */
export const getAllHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;

    const query: ApplicationQueryParams = {
      status: qs(req.query.status) as ApplicationStatus | undefined,
      source: qs(req.query.source) as ApplicationSource | undefined,
      companyName: qs(req.query.companyName),
      page: qs(req.query.page),
      pageSize: qs(req.query.pageSize),
    };

    const result = await ApplicationService.getApplications(userId, query);

    sendSuccess(
      res,
      'Applications fetched successfully',
      result.data,
      200,
      result.meta
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/applications/:id
 * Returns a single application with full status history.
 *
 * Success: 200 with application + statusHistory array
 * Failure: 404 not found | 403 wrong owner
 */
export const getByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const id = qs(req.params.id)!;

    const application = await ApplicationService.getApplicationById(
      userId,
      id
    );

    sendSuccess(res, 'Application fetched successfully', application);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/applications/:id
 * Updates an application. Status changes are auto-logged to history.
 *
 * Success: 200 with updated application
 * Failure: 422 Validation | 404 not found | 403 wrong owner
 */
export const updateHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (hasValidationErrors(req, res)) return;

    const { userId } = (req as AuthenticatedRequest).user;
    const id = qs(req.params.id)!;

    const dto: UpdateApplicationDto = {
      jobTitle: req.body.jobTitle,
      companyName: req.body.companyName,
      jobUrl: req.body.jobUrl,
      jobDescription: req.body.jobDescription,
      location: req.body.location,
      salaryRange: req.body.salaryRange,
      status: req.body.status,
      source: req.body.source,
      appliedAt: req.body.appliedAt,
      nextFollowUpDate: req.body.nextFollowUpDate,
      notes: req.body.notes,
      contactName: req.body.contactName,
      contactEmail: req.body.contactEmail,
      resumeId: req.body.resumeId,
    };

    const application = await ApplicationService.updateApplication(
      userId,
      id,
      dto
    );

    sendSuccess(res, 'Application updated successfully', application);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/applications/:id
 * Permanently deletes an application and its status history.
 *
 * Success: 200 with confirmation message
 * Failure: 404 not found | 403 wrong owner
 */
export const deleteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const id = qs(req.params.id)!;

    await ApplicationService.deleteApplication(userId, id);

    sendSuccess(res, 'Application deleted successfully');
  } catch (error) {
    next(error);
  }
};