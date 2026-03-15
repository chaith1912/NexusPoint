// src/services/auth.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Authentication Business Logic
// ─────────────────────────────────────────────────────────────────────────────
// Handles:
//   - User registration (duplicate check, password hashing, JWT generation)
//   - User login       (credential validation, JWT generation)
//   - Token generation (centralized, single place to change expiry/algorithm)
//
// Security decisions:
//   - bcrypt salt rounds: 12 (good balance of security vs. performance)
//     rounds=10 → ~100ms, rounds=12 → ~400ms, rounds=14 → ~1.5s
//   - JWT expiry: 7 days (adjust for your security requirements)
//   - passwordHash is NEVER included in any returned object
//   - All errors thrown as AppError — caught by globalErrorHandler
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  JwtPayload,
} from '../types/index';

// ── Constants ─────────────────────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// ── Token Generator ───────────────────────────────────────────────────────────

/**
 * Generates a signed JWT access token for a given user.
 * Centralized here so expiry and algorithm are changed in one place.
 *
 * @param userId - UUID of the user
 * @param email  - Email of the user (for client-side display without extra API call)
 * @returns Signed JWT string
 */
const generateAccessToken = (userId: string, email: string): string => {
  const secret = process.env.JWT_SECRET;

  // Defensive: this should never happen if app.ts validates env on startup
  if (!secret) {
    throw new AppError('JWT_SECRET is not configured', 500);
  }

  const payload: JwtPayload = { userId, email };

  return jwt.sign(payload, secret, {
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256',
  });
};

// ── Safe User Shape ───────────────────────────────────────────────────────────

/**
 * Strips sensitive fields before returning user data to the client.
 * Add any future sensitive fields here (e.g. 2FA secret).
 * passwordHash must NEVER leave this service.
 */
const sanitizeUser = (user: {
  id: string;
  fullName: string;
  email: string;
  profileUrl: string | null;
  createdAt: Date;
  passwordHash: string; // Present in DB record, stripped here
}): AuthResponseDto['user'] => {
  const { passwordHash: _removed, ...safeUser } = user;
  return safeUser;
};

// ── Register ──────────────────────────────────────────────────────────────────

/**
 * Registers a new user account.
 *
 * Steps:
 *   1. Check if email is already taken
 *   2. Hash the password with bcrypt
 *   3. Create the user record in DB
 *   4. Generate and return a JWT
 *
 * @param dto - { fullName, email, password, profileUrl? }
 * @returns   AuthResponseDto with accessToken and safe user object
 * @throws    AppError(409) if email already exists
 */
export const registerUser = async (
  dto: RegisterDto
): Promise<AuthResponseDto> => {
  const { fullName, email, password, profileUrl } = dto;

  // ── Step 1: Duplicate email check ──────────────────────────────────────
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existingUser) {
    throw new AppError(
      'An account with this email already exists',
      409 // Conflict
    );
  }

  // ── Step 2: Hash password ───────────────────────────────────────────────
  // bcrypt automatically generates and embeds the salt
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // ── Step 3: Create user ─────────────────────────────────────────────────
  const newUser = await prisma.user.create({
    data: {
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(), // Normalize email to lowercase
      passwordHash,
      profileUrl: profileUrl?.trim() ?? null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      profileUrl: true,
      createdAt: true,
      passwordHash: true, // Selected here only to pass into sanitizeUser
    },
  });

  // ── Step 4: Generate token ──────────────────────────────────────────────
  const accessToken = generateAccessToken(newUser.id, newUser.email);

  return {
    accessToken,
    user: sanitizeUser(newUser),
  };
};

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Authenticates an existing user.
 *
 * Steps:
 *   1. Look up user by email
 *   2. Compare submitted password against stored bcrypt hash
 *   3. Check account is active (not soft-deleted)
 *   4. Generate and return a JWT
 *
 * Security note:
 *   Steps 1 and 2 return the SAME error message intentionally.
 *   Distinguishing "email not found" from "wrong password" is a
 *   user enumeration vulnerability — attackers could map valid emails.
 *
 * @param dto - { email, password }
 * @returns   AuthResponseDto with accessToken and safe user object
 * @throws    AppError(401) for any credential failure
 * @throws    AppError(403) if account is deactivated
 */
export const loginUser = async (dto: LoginDto): Promise<AuthResponseDto> => {
  const { email, password } = dto;

  // ── Step 1: Find user by email ──────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      fullName: true,
      email: true,
      profileUrl: true,
      passwordHash: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Intentionally vague: same message for "not found" and "wrong password"
  const invalidCredentialsError = new AppError(
    'Invalid email or password',
    401
  );

  if (!user) {
    throw invalidCredentialsError;
  }

  // ── Step 2: Verify password ─────────────────────────────────────────────
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw invalidCredentialsError;
  }

  // ── Step 3: Check account is active ────────────────────────────────────
  if (!user.isActive) {
    throw new AppError(
      'This account has been deactivated — please contact support',
      403
    );
  }

  // ── Step 4: Generate token ──────────────────────────────────────────────
  const accessToken = generateAccessToken(user.id, user.email);

  return {
    accessToken,
    user: sanitizeUser(user),
  };
};

// ── Get Profile ───────────────────────────────────────────────────────────────

/**
 * Fetches the current user's profile by their ID.
 * Used by GET /auth/me — validates the JWT is still associated
 * with an active account.
 *
 * @param userId - UUID from decoded JWT payload
 * @returns Safe user object (no passwordHash)
 * @throws  AppError(404) if user no longer exists
 * @throws  AppError(403) if account is deactivated
 */
export const getUserProfile = async (
  userId: string
): Promise<AuthResponseDto['user']> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      profileUrl: true,
      passwordHash: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.isActive) {
    throw new AppError('This account has been deactivated', 403);
  }

  return sanitizeUser(user);
};
