import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envValue, isProduction, settings } from "../config";
import * as schema from "./schema";

function makeClient(): ReturnType<typeof postgres> {
  const sharedOpts = { max: 5, prepare: false } as const;

  // Cloud SQL Auth Proxy socket: CLOUD_SQL_INSTANCE = project:region:instance
  // Cloud Run attaches the socket at /cloudsql/<CLOUD_SQL_INSTANCE>
  const cloudSqlInstance = envValue("CLOUD_SQL_INSTANCE");
  if (cloudSqlInstance) {
    const cloudSqlUser = envValue("CLOUD_SQL_USER");
    const cloudSqlPassword = envValue("CLOUD_SQL_PASSWORD");
    const cloudSqlDatabase = envValue("CLOUD_SQL_DATABASE");

    if (isProduction() && (!cloudSqlUser || !cloudSqlPassword || !cloudSqlDatabase)) {
      throw new Error(
        "CLOUD_SQL_USER, CLOUD_SQL_PASSWORD, and CLOUD_SQL_DATABASE are required when CLOUD_SQL_INSTANCE is set in production.",
      );
    }

    return postgres({
      ...sharedOpts,
      host: `/cloudsql/${cloudSqlInstance}`,
      user: cloudSqlUser ?? "agent_app",
      password: cloudSqlPassword ?? "",
      database: cloudSqlDatabase ?? "agent_context",
    });
  }

  const url = envValue("DATABASE_URL");
  if (url) {
    return postgres(url, sharedOpts);
  }

  const appSettings = settings();
  const explicitPostgresHost = envValue("POSTGRES_HOST");
  const host = explicitPostgresHost ?? envValue("POSTGRES_HOST_BIND");

  if (isProduction() && !host) {
    throw new Error("DATABASE_URL or CLOUD_SQL_INSTANCE is required in production.");
  }

  const user = appSettings.POSTGRES_USER;
  const password = appSettings.POSTGRES_PASSWORD;
  const resolvedHost = host ?? "127.0.0.1";
  const port = Number(envValue("POSTGRES_HOST_PORT") ?? (explicitPostgresHost ? "5432" : "55432"));
  const database = appSettings.POSTGRES_DB;

  return postgres({ ...sharedOpts, host: resolvedHost, port, user, password, database });
}

export const queryClient = makeClient();

export const db = drizzle(queryClient, { schema });
