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
