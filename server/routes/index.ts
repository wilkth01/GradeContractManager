import type { Express } from "express";
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import auditRouter from "./audit";
import canvasImportRouter from "./canvas-import";

/**
 * IMPORTANT: This module is NOT currently in use.
 *
 * All routes are currently defined in the monolithic routes.ts file.
 * These modular route files were created as part of an incomplete refactoring effort.
 *
 * DO NOT call registerRouteModules() without first removing duplicate routes from routes.ts,
 * or you will get conflicting route handlers.
 *
 * Future refactoring plan:
 * 1. Extract remaining routes from routes.ts into modules
 * 2. Remove duplicates from routes.ts
 * 3. Call registerRouteModules() from server/index.ts
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
