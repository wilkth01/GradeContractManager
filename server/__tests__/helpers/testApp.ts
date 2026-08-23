/**
 * Boots the real Express app -- real auth, real route modules, real middleware,
 * real error handler -- against the in-memory storage fake.
 */
import express, { type Express } from "express";
import request from "supertest";

export async function createTestApp(): Promise<Express> {
  const { setupAuth } = await import("../../auth");
  const { registerRouteModules } = await import("../../routes/index");
  const { errorHandler } = await import("../../middleware");

  const app = express();
  app.use(express.json());

  setupAuth(app);
  registerRouteModules(app);
  app.use(errorHandler);

  return app;
}

/**
 * Log in and return an agent that carries the session cookie.
 *
 * Passwords in the fake are stored as the literal string "hashed", so the local
 * strategy is given a matching hash by hashing the plaintext at fixture time.
 */
export async function loginAs(app: Express, username: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/login").send({ username, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${username}: ${res.status} ${res.text}`);
  }
  return agent;
}
