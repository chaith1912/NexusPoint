// src/config/database.ts
// ─────────────────────────────────────────────────────────────────────────────
// Prisma v7 requires an explicit database adapter.
// PrismaClient no longer reads DATABASE_URL automatically — you must pass it
// via @prisma/adapter-pg (the official PostgreSQL adapter for Prisma v7+).
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import dotenv from 'dotenv';
dotenv.config();

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[Database] FATAL: DATABASE_URL environment variable is not set');
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']  // Full logging in dev
        : ['warn', 'error'],                  // Minimal logging in prod
  });
};

// In development: reuse the global instance across hot-reloads (nodemon)
// In production:  module cache handles the singleton naturally

const prisma: PrismaClient =
  process.env.NODE_ENV === 'production'
    ? createPrismaClient()
    : (globalThis.__prisma ?? (globalThis.__prisma = createPrismaClient()));

export default prisma;

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});