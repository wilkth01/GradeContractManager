import type { Express } from "express";
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import auditRouter from "./audit";
import canvasImportRouter from "./canvas-import";

/**
 * Register all route modules with the Express app
 */
export function registerRouteModules(app: Express): void {
  // Register route modules
  app.use(classesRouter);
  app.use(assignmentsRouter);
  app.use(auditRouter);
  app.use(canvasImportRouter);

  // Note: Additional route modules will be added as they are extracted:
  // - contracts.ts (grade contracts)
  // - student-contracts.ts (student contract selection)
  // - progress.ts (assignment progress)
  // - invitations.ts (student invitations)
  // - engagement.ts (engagement intentions)
  // - attendance.ts (attendance tracking)
  // - analytics.ts (class analytics)
}
