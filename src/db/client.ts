import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function makeClient(): ReturnType<typeof postgres> {
  const sharedOpts = { max: 5, prepare: false } as const;

  // Cloud SQL Auth Proxy socket: CLOUD_SQL_INSTANCE = project:region:instance
  // Cloud Run attaches the socket at /cloudsql/<CLOUD_SQL_INSTANCE>
  const cloudSqlInstance = envValue("CLOUD_SQL_INSTANCE");
  if (cloudSqlInstance) {
    return postgres({
      ...sharedOpts,
      host: `/cloudsql/${cloudSqlInstance}`,
      user: envValue("CLOUD_SQL_USER") ?? "agent_app",
      password: envValue("CLOUD_SQL_PASSWORD") ?? "",
      database: envValue("CLOUD_SQL_DATABASE") ?? "agent_context",
    });
  }

  const url = envValue("DATABASE_URL");
  if (url) {
    return postgres(url, sharedOpts);
  }

  if (isProduction()) {
    throw new Error("DATABASE_URL or CLOUD_SQL_INSTANCE is required in production.");
  }

  const user = envValue("POSTGRES_USER") ?? "agent_app";
  const password = envValue("POSTGRES_PASSWORD") ?? "agent_app";
  const host = envValue("POSTGRES_HOST_BIND") ?? envValue("POSTGRES_HOST") ?? "127.0.0.1";
  const port = Number(envValue("POSTGRES_HOST_PORT") ?? "55432");
  const database = envValue("POSTGRES_DB") ?? "agent_context";

  return postgres({ ...sharedOpts, host, port, user, password, database });
}

export const queryClient = makeClient();

export const db = drizzle(queryClient, { schema });
