import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalString = z.preprocess(emptyStringToUndefined, z.string().optional());

const rawSettingsSchema = z.object({
  NODE_ENV: optionalString,
  PORT: optionalString,
  LLM_PROVIDER: z.preprocess(
    emptyStringToUndefined,
    z.enum(["openai", "gemini"]).default("openai"),
  ),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  OPENAI_MODEL: z.preprocess(emptyStringToUndefined, z.string().default("gpt-4.1-mini")),
  OPENAI_REASONING_EFFORT: z.preprocess(
    emptyStringToUndefined,
    z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  ),
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.preprocess(emptyStringToUndefined, z.string().default("gemini-3.5-flash")),
  GOOGLE_API_KEY: optionalString,
  GOOGLE_AGENT_PLATFORM_KEY: optionalString,
  GOOGLE_GENAI_USE_ENTERPRISE: optionalString,
  GOOGLE_CLOUD_PROJECT: optionalString,
  GOOGLE_CLOUD_LOCATION: z.preprocess(emptyStringToUndefined, z.string().default("global")),
  GEMINI_PROJECT_NUMBER: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  SESSION_SECRET: optionalString,
  ALLOWED_EMAILS: optionalString,
  DATABASE_URL: optionalString,
  CLOUD_SQL_INSTANCE: optionalString,
  CLOUD_SQL_USER: optionalString,
  CLOUD_SQL_PASSWORD: optionalString,
  CLOUD_SQL_DATABASE: optionalString,
  POSTGRES_USER: z.preprocess(emptyStringToUndefined, z.string().default("agent_app")),
  POSTGRES_PASSWORD: z.preprocess(emptyStringToUndefined, z.string().default("agent_app")),
  POSTGRES_HOST_BIND: optionalString,
  POSTGRES_HOST: optionalString,
  POSTGRES_HOST_PORT: optionalString,
  POSTGRES_DB: z.preprocess(emptyStringToUndefined, z.string().default("agent_context")),
});

export type Settings = z.infer<typeof rawSettingsSchema>;

let cachedSettings: Settings | null = null;

function formatSettingsError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
}

export function settings(): Settings {
  if (cachedSettings) {
    return cachedSettings;
  }

  const parsed = rawSettingsSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatSettingsError(parsed.error)}`);
  }

  cachedSettings = parsed.data;
  return cachedSettings;
}

export function envValue(name: keyof Settings): string | undefined {
  const value = settings()[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function envFlag(name: keyof Settings): boolean {
  return ["1", "true", "yes", "on"].includes((envValue(name) ?? "").toLowerCase());
}

export function isProduction(): boolean {
  return settings().NODE_ENV === "production";
}

export function parsePort(rawPort: string | undefined): number {
  if (!rawPort || rawPort.trim().length === 0) {
    return 3000;
  }

  const portCandidate = rawPort.trim();

  if (!/^\d+$/.test(portCandidate)) {
    return 3000;
  }

  const parsedPort = Number(portCandidate);
  return Number.isSafeInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535
    ? parsedPort
    : 3000;
}

export function postgresConnectionUrl(host: string): string {
  const appSettings = settings();
  const port = envValue("POSTGRES_HOST_PORT") ?? "5432";
  return `postgresql://${encodeURIComponent(appSettings.POSTGRES_USER)}:${encodeURIComponent(
    appSettings.POSTGRES_PASSWORD,
  )}@${host}:${port}/${encodeURIComponent(appSettings.POSTGRES_DB)}`;
}
