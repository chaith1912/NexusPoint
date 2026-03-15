// src/app.ts
// ─────────────────────────────────────────────────────────────────────────────
// NexusPoint API — Application Entry Point
// ─────────────────────────────────────────────────────────────────────────────
// Responsibilities:
//   1. Validate required environment variables before anything else
//   2. Initialize Express with security + parsing middleware
//   3. Mount all API routes
//   4. Register 404 and global error handlers (must be last)
//   5. Start the HTTP server
//
// Middleware order matters in Express — do not reorder without understanding
// the implications. Security headers → CORS → Rate limit → Body parser →
// Routes → 404 handler → Error handler
// ─────────────────────────────────────────────────────────────────────────────

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import prisma from './config/database';
import { notFoundHandler, globalErrorHandler } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import applicationRoutes from './routes/application.routes';
import { EnvironmentVariables } from './types/index';

// ── Load Environment Variables ────────────────────────────────────────────────
// Must happen before any other imports that read process.env
dotenv.config();

// ── Environment Validator ─────────────────────────────────────────────────────

/**
 * Validates all required environment variables at startup.
 * Crashes the process immediately with a clear message if any are missing.
 * This is intentional — a misconfigured server should never serve traffic.
 */
const validateEnvironment = (): EnvironmentVariables => {
  const required: (keyof EnvironmentVariables)[] = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PORT',
    'NODE_ENV',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `[Startup] FATAL: Missing required environment variables: ${missing.join(', ')}`
    );
    console.error('[Startup] Check your .env file and try again.');
    process.exit(1); // Hard exit — do not start the server
  }

  // JWT_SECRET length check — a short secret is a security vulnerability
  if ((process.env.JWT_SECRET as string).length < 32) {
    console.error(
      '[Startup] FATAL: JWT_SECRET must be at least 32 characters long'
    );
    process.exit(1);
  }

  return process.env as unknown as EnvironmentVariables;
};

const env = validateEnvironment();

// ── Express App ───────────────────────────────────────────────────────────────

const app: Application = express();
const PORT = parseInt(env.PORT, 10) || 3001;

// ── Security Middleware ───────────────────────────────────────────────────────

/**
 * Helmet sets secure HTTP headers:
 * X-Content-Type-Options, X-Frame-Options, HSTS, etc.
 * Protects against common web vulnerabilities with zero config.
 */
app.use(helmet());

/**
 * CORS configuration.
 * In development: allows all origins (Flutter app, Postman, Chrome extension).
 * In production: lock this down to your actual frontend domain.
 *
 * Module 2 (Chrome Extension) will need its extension origin added here.
 * Format: "chrome-extension://<your-extension-id>"
 */
const corsOptions: cors.CorsOptions = {
  origin:
    env.NODE_ENV === 'development'
      ? '*' // Allow all in dev
      : (process.env.ALLOWED_ORIGINS ?? '').split(','), // Comma-separated in prod
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

/**
 * Global rate limiter — applied to ALL routes.
 * Protects against brute force and DDoS.
 * Auth routes get a stricter limiter mounted separately below.
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per window per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests — please try again in 15 minutes',
  },
});

app.use(globalRateLimiter);

/**
 * Strict rate limiter for auth endpoints only.
 * Limits login/register attempts to prevent brute force attacks.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // Only 20 auth attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts — please try again in 15 minutes',
  },
});

// ── Body Parsers ──────────────────────────────────────────────────────────────

// Parse JSON bodies — limit prevents large payload attacks
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Health Check ──────────────────────────────────────────────────────────────

/**
 * GET /health
 * Used by Docker, load balancers, and uptime monitors.
 * Also verifies DB connectivity — a shallow ping to Postgres.
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Prisma raw query ping — confirms DB is reachable
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: 'NexusPoint API is running',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch {
    res.status(503).json({
      success: false,
      message: 'Database connection failed',
      database: 'disconnected',
    });
  }
});

// ── API Routes ────────────────────────────────────────────────────────────────

// Auth routes — with stricter rate limiting
app.use('/api/auth', authRateLimiter, authRoutes);

// Application routes — protected inside the router
app.use('/api/applications', applicationRoutes);

// ── Error Handlers (must be last) ────────────────────────────────────────────

app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Server Startup ────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│         NexusPoint API — Started         │');
  console.log('├─────────────────────────────────────────┤');
  console.log(`│  Environment : ${env.NODE_ENV.padEnd(25)}│`);
  console.log(`│  Port        : ${String(PORT).padEnd(25)}│`);
  console.log(`│  Health      : http://localhost:${PORT}/health  │`);
  console.log('└─────────────────────────────────────────┘');
  console.log('');
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

/**
 * Handles SIGTERM (Docker stop, cloud shutdown signals).
 * Closes the HTTP server first, then disconnects Prisma.
 * In-flight requests get a chance to complete before shutdown.
 */
process.on('SIGTERM', async () => {
  console.log('[Shutdown] SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[Shutdown] Database disconnected. Goodbye.');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Shutdown] SIGINT received — shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[Shutdown] Database disconnected. Goodbye.');
    process.exit(0);
  });
});

export default app;