import type { Express } from "express";
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import auditRouter from "./audit";
import canvasImportRouter from "./canvas-import";

/**
 * Modular route registration for the Contract Grade Tracker API.
 *
 * These routes are registered BEFORE the monolithic routes.ts file,
 * so they take precedence for the endpoints they handle.
 *
 * Currently extracted modules:
 * - classes.ts: Class CRUD, archive/unarchive, delete
 * - assignments.ts: Assignment CRUD
 * - audit.ts: Audit logging
 * - canvas-import.ts: Canvas gradebook import
 *
 * Future refactoring: Extract remaining routes from routes.ts into modules.
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
