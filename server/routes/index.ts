import type { Express } from "express";
import classesRouter from "./classes";
import assignmentsRouter from "./assignments";
import contractsRouter from "./contracts";
import progressRouter from "./progress";
import studentsRouter from "./students";
import attendanceRouter from "./attendance";
import invitationsRouter from "./invitations";
import analyticsRouter from "./analytics";
import accountRecoveryRouter from "./account-recovery";
import auditRouter from "./audit";
import canvasImportRouter from "./canvas-import";
import canvasRouter from "./canvas";
import messagesRouter from "./messages";

/**
 * Route registration for the Contract Grade Tracker API.
 *
 * Every module authorizes through the shared middleware in server/middleware:
 * requireClassOwner for instructor-owned writes, requireClassMember for
 * anything an enrolled student may read, and requireStudentAccess for routes
 * scoped to a single student. Handlers are wrapped in asyncHandler so a
 * rejected promise reaches the centralized error handler instead of hanging
 * the request.
 */
export function registerRouteModules(app: Express): void {
  app.use(classesRouter);
  app.use(assignmentsRouter);
  app.use(contractsRouter);
  app.use(progressRouter);
  app.use(studentsRouter);
  app.use(attendanceRouter);
  app.use(invitationsRouter);
  app.use(analyticsRouter);
  app.use(accountRecoveryRouter);
  app.use(auditRouter);
  app.use(canvasImportRouter);
  app.use(canvasRouter);
  app.use(messagesRouter);
}
