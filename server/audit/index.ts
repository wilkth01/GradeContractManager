import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import type { AuditLogParams, AuditAction, EntityType } from "./types";
import type { Request } from "express";

export class AuditService {
  /**
   * Log an audit event
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        oldValues: params.oldValues ?? null,
        newValues: params.newValues ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      });
    } catch (error) {
      // Log error but don't throw - audit logging should not break the main flow
      console.error("Failed to create audit log:", error);
    }
  }

  /**
   * Log an audit event with Express request context
   */
  async logWithRequest(
    req: Request,
    params: Omit<AuditLogParams, "userId" | "ipAddress" | "userAgent">
  ): Promise<void> {
    const userId = req.user?.id ?? null;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const userAgent = req.headers["user-agent"] || undefined;

    await this.log({
      ...params,
      userId,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Get audit logs for a specific entity
   */
  async getLogsForEntity(entityType: EntityType, entityId: number) {
    return db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId)
        )
      )
      .orderBy(desc(auditLogs.createdAt));
  }

  /**
   * Get audit logs for a specific user (actions they performed)
   */
  async getLogsForUser(userId: number) {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt));
  }

  /**
   * Get audit logs for a student (changes to their records)
   */
  async getLogsForStudent(studentId: number) {
    // Get logs where the student is the target of the action
    // This includes progress updates, contract changes, attendance, etc.
    const progressLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "assignment_progress"),
        )
      )
      .orderBy(desc(auditLogs.createdAt));

    // Filter to only include logs that relate to this student
    // Check newValues or oldValues for studentId
    return progressLogs.filter((log) => {
      const newValues = log.newValues as Record<string, unknown> | null;
      const oldValues = log.oldValues as Record<string, unknown> | null;
      return (
        newValues?.studentId === studentId ||
        oldValues?.studentId === studentId
      );
    });
  }

  /**
   * Get all audit logs related to a class
   * Includes: class changes, assignments, contracts, student progress, attendance
   */
  async getLogsForClass(classId: number, limit: number = 100) {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit * 5); // Fetch more since we'll filter

    // Filter to logs related to this class
    return logs
      .filter((log) => {
        // Direct class logs
        if (log.entityType === "class" && log.entityId === classId) {
          return true;
        }

        // Check newValues/oldValues for classId
        const newValues = log.newValues as Record<string, unknown> | null;
        const oldValues = log.oldValues as Record<string, unknown> | null;
        return (
          newValues?.classId === classId || oldValues?.classId === classId
        );
      })
      .slice(0, limit);
  }

  /**
   * Get recent audit logs (for admin dashboard)
   */
  async getRecentLogs(limit: number = 50) {
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }
}

// Export a singleton instance
export const auditService = new AuditService();

// Re-export types
export type { AuditAction, EntityType, AuditLogParams } from "./types";
