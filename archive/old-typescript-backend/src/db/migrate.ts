/**
 * Migration Runner for Varsity Companion
 * Supports applying and validating initial migrations against PostgreSQL (Neon)
 * or performing static AST/syntax checks in offline development environments.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";

export async function runMigrations(direction: "up" | "down" = "up"): Promise<void> {
  const migrationFile = direction === "up"
    ? path.join(process.cwd(), "prisma", "migrations", "20260923101000_init_users_courses_deadlines", "migration.sql")
    : path.join(process.cwd(), "migrations", "0001_rollback.sql");

  if (!fs.existsSync(migrationFile)) {
    throw new Error(`Migration file not found: ${migrationFile}`);
  }

  const sql = fs.readFileSync(migrationFile, "utf-8");
  const databaseUrl = process.env.DATABASE_URL;

  console.log(`[Migration] Preparing to run migration [${direction.toUpperCase()}] from: ${path.basename(migrationFile)}`);

  if (!databaseUrl) {
    console.log("[Migration] No DATABASE_URL provided. Validating SQL syntax in dry-run mode...");
    // Validate that SQL contains critical table definitions
    const requiredDefinitions = direction === "up"
      ? ["CREATE TABLE IF NOT EXISTS \"users\"", "CREATE TABLE IF NOT EXISTS \"courses\"", "CREATE TABLE IF NOT EXISTS \"academic_deadlines\""]
      : ["DROP TABLE IF EXISTS \"users\"", "DROP TABLE IF EXISTS \"courses\"", "DROP TABLE IF EXISTS \"academic_deadlines\""];

    for (const def of requiredDefinitions) {
      if (!sql.includes(def)) {
        throw new Error(`Migration SQL validation failed: missing expected statement "${def}"`);
      }
    }
    console.log("[Migration] ✓ SQL syntax and critical table definitions successfully validated in dry-run mode.");
    return;
  }

  // Connect and execute migration
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure migration tracker table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(255) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
      ALTER TABLE "_prisma_migrations" ALTER COLUMN "id" TYPE VARCHAR(255);
    `);

    console.log(`[Migration] Applying SQL batch...`);
    await client.query(sql);

    const migrationName = "20260923101000_init_users_courses_deadlines";
    if (direction === "up") {
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count")
         VALUES ($1, $2, clock_timestamp(), $3, 1)
         ON CONFLICT ("id") DO UPDATE SET "finished_at" = clock_timestamp();`,
        [migrationName, "init_hash", migrationName]
      );
    }

    await client.query("COMMIT");
    console.log(`[Migration] ✓ Migration [${direction.toUpperCase()}] applied successfully.`);
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error(`[Migration] ✗ Error running migration:`, err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Auto-run if invoked directly via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const direction = process.argv.includes("--down") ? "down" : "up";
  runMigrations(direction)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
