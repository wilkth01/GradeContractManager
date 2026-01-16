export type WSEventType = "PROGRESS_UPDATE";

export interface WSEvent {
  type: WSEventType;
  classId: number;
  payload: unknown;
  timestamp: string;
}

export interface ProgressUpdatePayload {
  studentId: number;
  assignmentId: number;
  status?: number;
  numericGrade?: string;
  attempts?: number;
}

export function createProgressUpdateEvent(
  classId: number,
  payload: ProgressUpdatePayload
): WSEvent {
  return {
    type: "PROGRESS_UPDATE",
    classId,
    payload,
    timestamp: new Date().toISOString(),
  };
}
