// src/services/application.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Application CRUD Business Logic
// ─────────────────────────────────────────────────────────────────────────────
// This is the central service of NexusPoint. All job application tracking
// logic lives here. Every function enforces user ownership — a user can
// only ever read or modify their own applications.
//
// Status History:
//   Every status change is automatically written to ApplicationStatusHistory.
//   This powers the timeline view in Module 3 (Flutter Kanban board).
//   It is written in the same Prisma transaction as the update to guarantee
//   consistency — if the update fails, the history entry is also rolled back.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import {
  CreateApplicationDto,
  UpdateApplicationDto,
  ApplicationQueryParams,
  PaginationMeta,
} from '../types/index';
import { Application, ApplicationStatus } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Shape returned by getApplications —
 * includes the data array and pagination metadata.
 */
export interface PaginatedApplications {
  data: Application[];
  meta: PaginationMeta;
}

/**
 * Full application detail including status history.
 * Used by getApplicationById for the detail view in Module 3.
 */
export type ApplicationWithHistory = Application & {
  statusHistory: {
    id: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    changedAt: Date;
    note: string | null;
  }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Creates a new job application and logs the initial status
 * to ApplicationStatusHistory.
 *
 * The history entry is written in the same transaction as the
 * application creation — both succeed or both fail together.
 *
 * @param userId - ID of the authenticated user
 * @param dto    - Application data from request body
 * @returns      Newly created application
 */
export const createApplication = async (
  userId: string,
  dto: CreateApplicationDto
): Promise<Application> => {

  const initialStatus = dto.status ?? ApplicationStatus.BOOKMARKED;

  // Prisma transaction — application + first history entry are atomic
  const application = await prisma.$transaction(async (tx) => {

    // ── Create the application ──────────────────────────────────────
    const newApp = await tx.application.create({
      data: {
        userId,
        jobTitle: dto.jobTitle.trim(),
        companyName: dto.companyName.trim(),
        jobUrl: dto.jobUrl?.trim() ?? null,
        jobDescription: dto.jobDescription?.trim() ?? null,
        location: dto.location?.trim() ?? null,
        salaryRange: dto.salaryRange?.trim() ?? null,
        status: initialStatus,
        source: dto.source ?? 'OTHER',
        appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : null,
        nextFollowUpDate: dto.nextFollowUpDate
          ? new Date(dto.nextFollowUpDate)
          : null,
        notes: dto.notes?.trim() ?? null,
        contactName: dto.contactName?.trim() ?? null,
        contactEmail: dto.contactEmail?.trim() ?? null,
        resumeId: dto.resumeId ?? null,
        aiParsedKeywords: [],
        aiMatchScore: null,
      },
    });

    // ── Log initial status to history ───────────────────────────────
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: newApp.id,
        fromStatus: null, // null = this is the first status entry
        toStatus: initialStatus,
        note: 'Application created',
      },
    });

    return newApp;
  });

  return application;
};

// ── Get All (Paginated + Filtered) ────────────────────────────────────────────

/**
 * Returns a paginated, filtered list of applications for a user.
 * Only returns applications that belong to the requesting user.
 *
 * Supported filters: status, source, companyName (partial match)
 * Pagination: page (1-based), pageSize (max 50)
 *
 * @param userId - ID of the authenticated user
 * @param query  - Filter + pagination params from request query string
 * @returns      Paginated applications with metadata
 */
export const getApplications = async (
  userId: string,
  query: ApplicationQueryParams
): Promise<PaginatedApplications> => {

  // ── Parse pagination params ─────────────────────────────────────
  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize ?? String(DEFAULT_PAGE_SIZE), 10))
  );
  const skip = (page - 1) * pageSize;

  // ── Build where clause dynamically ─────────────────────────────
  // Only add filters that were actually provided in the query
  const where = {
    userId, // Always filter by owner — never expose other users' data
    ...(query.status && { status: query.status }),
    ...(query.source && { source: query.source }),
    ...(query.companyName && {
      companyName: {
        contains: query.companyName,
        mode: 'insensitive' as const, // Case-insensitive search
      },
    }),
  };

  // ── Run count + data queries in parallel for performance ────────
  const [total, applications] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: { updatedAt: 'desc' }, // Most recently updated first
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    data: applications,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
};

// ── Get By ID ─────────────────────────────────────────────────────────────────

/**
 * Returns a single application with its full status history.
 * Enforces ownership — throws 403 if the application belongs
 * to a different user.
 *
 * @param userId        - ID of the authenticated user
 * @param applicationId - ID of the application to fetch
 * @returns             Application with statusHistory array
 * @throws              AppError(404) if not found
 * @throws              AppError(403) if wrong owner
 */
export const getApplicationById = async (
  userId: string,
  applicationId: string
): Promise<ApplicationWithHistory> => {

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      statusHistory: {
        orderBy: { changedAt: 'asc' }, // Chronological order for timeline
      },
    },
  });

  // ── Existence check ─────────────────────────────────────────────
  if (!application) {
    throw new AppError('Application not found', 404);
  }

  // ── Ownership check ─────────────────────────────────────────────
  // Check AFTER existence to avoid leaking whether an ID exists
  if (application.userId !== userId) {
    throw new AppError(
      'You do not have permission to view this application',
      403
    );
  }

  return application;
};

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Updates an application. If the status field changed, automatically
 * creates an ApplicationStatusHistory entry in the same transaction.
 *
 * @param userId        - ID of the authenticated user
 * @param applicationId - ID of the application to update
 * @param dto           - Fields to update (all optional)
 * @returns             Updated application
 * @throws              AppError(404) if not found
 * @throws              AppError(403) if wrong owner
 */
export const updateApplication = async (
  userId: string,
  applicationId: string,
  dto: UpdateApplicationDto
): Promise<Application> => {

  // ── Fetch existing to check ownership + detect status change ────
  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!existing) {
    throw new AppError('Application not found', 404);
  }

  if (existing.userId !== userId) {
    throw new AppError(
      'You do not have permission to update this application',
      403
    );
  }

  // ── Detect status change before updating ────────────────────────
  const statusChanged =
    dto.status !== undefined && dto.status !== existing.status;

  // ── Run update + optional history in a transaction ──────────────
  const updated = await prisma.$transaction(async (tx) => {

    const updatedApp = await tx.application.update({
      where: { id: applicationId },
      data: {
        ...(dto.jobTitle && { jobTitle: dto.jobTitle.trim() }),
        ...(dto.companyName && { companyName: dto.companyName.trim() }),
        ...(dto.jobUrl !== undefined && { jobUrl: dto.jobUrl?.trim() ?? null }),
        ...(dto.jobDescription !== undefined && {
          jobDescription: dto.jobDescription?.trim() ?? null,
        }),
        ...(dto.location !== undefined && {
          location: dto.location?.trim() ?? null,
        }),
        ...(dto.salaryRange !== undefined && {
          salaryRange: dto.salaryRange?.trim() ?? null,
        }),
        ...(dto.status && { status: dto.status }),
        ...(dto.source && { source: dto.source }),
        ...(dto.appliedAt !== undefined && {
          appliedAt: dto.appliedAt ? new Date(dto.appliedAt) : null,
        }),
        ...(dto.nextFollowUpDate !== undefined && {
          nextFollowUpDate: dto.nextFollowUpDate
            ? new Date(dto.nextFollowUpDate)
            : null,
        }),
        ...(dto.notes !== undefined && {
          notes: dto.notes?.trim() ?? null,
        }),
        ...(dto.contactName !== undefined && {
          contactName: dto.contactName?.trim() ?? null,
        }),
        ...(dto.contactEmail !== undefined && {
          contactEmail: dto.contactEmail?.trim() ?? null,
        }),
        ...(dto.resumeId !== undefined && {
          resumeId: dto.resumeId ?? null,
        }),
      },
    });

    // ── Auto-log status change to history ────────────────────────
    if (statusChanged && dto.status) {
      await tx.applicationStatusHistory.create({
        data: {
          applicationId,
          fromStatus: existing.status,
          toStatus: dto.status,
          note: dto.notes?.trim() ?? null,
        },
      });
    }

    return updatedApp;
  });

  return updated;
};

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Permanently deletes an application and all its status history.
 * Cascade delete is handled at the DB level (defined in schema.prisma).
 *
 * @param userId        - ID of the authenticated user
 * @param applicationId - ID of the application to delete
 * @throws              AppError(404) if not found
 * @throws              AppError(403) if wrong owner
 */
export const deleteApplication = async (
  userId: string,
  applicationId: string
): Promise<void> => {

  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!existing) {
    throw new AppError('Application not found', 404);
  }

  if (existing.userId !== userId) {
    throw new AppError(
      'You do not have permission to delete this application',
      403
    );
  }

  await prisma.application.delete({
    where: { id: applicationId },
  });
};
