import postgres from "postgres";
import { envValue, postgresConnectionUrl } from "../src/config";

const databaseUrl =
  envValue("DATABASE_URL") ?? postgresConnectionUrl(envValue("POSTGRES_HOST") ?? "postgres");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const migrationsDir = new URL("../db/migrations/", import.meta.url);

try {
  const migrationsGlob = new Bun.Glob("*.sql");
  const migrations = Array.from(migrationsGlob.scanSync(migrationsDir.pathname)).sort();

  for (const migration of migrations) {
    const migrationFile = Bun.file(new URL(migration, migrationsDir));
    const migrationSql = await migrationFile.text();
    await sql.unsafe(migrationSql);
    process.stdout.write(`Applied ${migration}\n`);
  }
} finally {
  await sql.end();
}
