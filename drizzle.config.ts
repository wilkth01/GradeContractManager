import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * Neon requires TLS, but the two paths to the database disagree about how to
 * arrange it.
 *
 * The app uses @neondatabase/serverless, which connects over a WebSocket and
 * handles TLS itself whatever the URL says. drizzle-kit uses node-postgres,
 * which refuses to connect ("connection is insecure") unless the URL asks for
 * TLS explicitly. A connection string that works for the running app can
 * therefore still fail every migration, which is exactly how this surfaced --
 * in a deploy, not in development.
 *
 * Adding sslmode when it is missing makes migrations work regardless of how
 * DATABASE_URL happens to be written in a given environment.
 */
function requireSsl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: requireSsl(process.env.DATABASE_URL),
  },
});
