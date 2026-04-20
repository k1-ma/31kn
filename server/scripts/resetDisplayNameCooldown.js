import pg from "pg";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

async function resetCooldown() {
  if (!DATABASE_URL) {
    console.error(
      "❌ DATABASE_URL not set. Please set DATABASE_URL or POSTGRES_URL in your environment variables."
    );
    process.exit(1);
  }

  // Determine if SSL is needed (similar to createPoolOnly logic)
  const isLocal = /localhost|127\.0\.0\.1/i.test(DATABASE_URL);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl,
  });

  try {
    console.log("🔄 Resetting display_name cooldown for all affected users...");

    const result = await pool.query(
      `UPDATE users 
       SET display_name_changed_at = NULL 
       WHERE display_name_changed_at IS NOT NULL 
       RETURNING id, username, display_name`
    );

    if (result.rowCount === 0) {
      console.log("✅ No users had an active cooldown. Nothing to reset.");
    } else {
      console.log(
        `✅ Reset cooldown for ${result.rowCount} user(s):\n`
      );
      result.rows.forEach((u) => {
        const displayName = u.display_name || "(no display name set)";
        console.log(`  - ${u.username} (ID: ${u.id}) - Display name: ${displayName}`);
      });
      console.log(
        `\n✅ All affected users can now change their display name again.`
      );
    }
  } catch (err) {
    console.error("❌ Error resetting cooldown:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetCooldown();
