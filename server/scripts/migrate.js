#!/usr/bin/env node
/**
 * Database Migration Script
 * 
 * Run this script to apply database migrations:
 *   node server/scripts/migrate.js
 * 
 * Or via npm script:
 *   npm run migrate
 * 
 * This script is idempotent - safe to run multiple times.
 * It creates tables, indexes, and applies schema changes.
 */

import dotenv from "dotenv";
import { initDb } from "../db.js";

// Load environment variables
dotenv.config();

const admin = {
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "change-me",
  nickname: process.env.ADMIN_NICKNAME || "Administrator",
};

async function runMigrations() {
  // eslint-disable-next-line no-console
  console.log("[migrate] Starting database migrations...");

  // Pre-flight: log the target host so we visually confirm we're hitting
  // the right DB before any schema work. Password is never printed —
  // URL.password is read but only URL.username + hostname + pathname are
  // logged. If the env is empty, warn loudly and let initDb() fail fast.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (url) {
    try {
      const u = new URL(url);
      // eslint-disable-next-line no-console
      console.log(`[migrate] Target: ${u.username}@${u.hostname}${u.pathname}`);
    } catch {}
  } else {
    // eslint-disable-next-line no-console
    console.warn('[migrate] No DATABASE_URL / POSTGRES_URL / POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING found in env');
  }

  try {
    const pool = await initDb({ admin });
    
    // eslint-disable-next-line no-console
    console.log("[migrate] ✓ All migrations completed successfully");
    
    // Clean up
    await pool.end();
    
    // eslint-disable-next-line no-console
    console.log("[migrate] ✓ Database connection closed");
    
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[migrate] ✗ Migration failed:", err?.message || err);
    
    if (err?.stack) {
      // eslint-disable-next-line no-console
      console.error("[migrate] Stack:", err.stack);
    }
    
    process.exit(1);
  }
}

runMigrations();
