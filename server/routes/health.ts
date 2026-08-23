import { Router } from "express";
import { storage } from "../storage";
import { log } from "../vite";

const router = Router();

/**
 * Liveness plus readiness.
 *
 * Render gates the deploy on this endpoint and rolls a release back when it
 * fails, so answering OK without touching the database would promote a release
 * that cannot reach Neon and then decline to roll it back -- the health check
 * would be reporting only that Node is running, which is never the interesting
 * question.
 *
 * The query is deliberately trivial, since Render polls this on an interval,
 * and it is bounded: a hung connection has to fail the check rather than hold
 * the request open until the platform's own timeout.
 */
export const HEALTH_DB_TIMEOUT_MS = 5000;

router.get("/api/health", async (_req, res) => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      storage.ping(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`database did not answer within ${HEALTH_DB_TIMEOUT_MS}ms`),
            ),
          HEALTH_DB_TIMEOUT_MS,
        );
      }),
    ]);
    res.json({ status: "OK", database: "OK" });
  } catch (err) {
    log(
      `health check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    res.status(503).json({ status: "unavailable", database: "unreachable" });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

export default router;
