import { z } from "zod";

// Zod-validated env loader. Infra keys are required and fail fast at startup;
// data-source / AI / delivery keys are optional in Phase 0 (wired in later
// phases) so the config surface is stable now without blocking boot.
const schema = z.object({
  // --- infra (required Phase 0) ---
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_DOMAIN: z.string().default("localhost"),

  // --- single-user app account (seeded) ---
  SEED_USER_EMAIL: z.string().optional(),
  SEED_USER_PASSWORD_HASH: z.string().optional(),
  SEED_WATCHLIST_NAME: z.string().default("Core"),
  SEED_TICKER: z.string().default("AAPL"),

  // --- data sources (Phase 1+) ---
  SEC_USER_AGENT: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  ALPHAVANTAGE_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),

  // --- AI (Phase 3+) ---
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // --- delivery (Phase 5) ---
  RESEND_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parse + validate process.env once, failing fast on missing required keys. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Environment validation failed");
  }
  cached = parsed.data;
  return cached;
}
