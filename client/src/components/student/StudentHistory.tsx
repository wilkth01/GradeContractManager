import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditLog {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

interface StudentHistoryProps {
  classId: number;
  studentId: number;
}

const actionLabels: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  CONFIRM: "Confirmed",
  ENROLL: "Enrolled",
};

const entityLabels: Record<string, string> = {
  assignment_progress: "Grade",
  student_contract: "Contract",
  attendance: "Attendance",
  engagement_intention: "Engagement",
};

const actionColors: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800",
  UPDATE: "bg-blue-100 text-blue-800",
  DELETE: "bg-red-100 text-red-800",
  CONFIRM: "bg-purple-100 text-purple-800",
  ENROLL: "bg-yellow-100 text-yellow-800",
};

function formatChange(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  entityType: string
): string {
  if (entityType === "assignment_progress") {
    const oldStatus = oldValues?.status as number | undefined;
    const newStatus = newValues?.status as number | undefined;
    const oldGrade = oldValues?.numericGrade as string | undefined;
    const newGrade = newValues?.numericGrade as string | undefined;

    const statusLabels = ["Not Submitted", "Not Submitted", "Work-in-Progress", "Successfully Completed"];

    if (newStatus !== undefined && oldStatus !== newStatus) {
      const oldLabel = statusLabels[oldStatus ?? 0] || "Unknown";
      const newLabel = statusLabels[newStatus] || "Unknown";
      return `Status: ${oldLabel} → ${newLabel}`;
    }

    if (newGrade !== undefined && oldGrade !== newGrade) {
      return `Grade: ${oldGrade ?? "N/A"} → ${newGrade}`;
    }
  }

  if (entityType === "student_contract") {
    if (newValues?.isConfirmed) {
      return "Contract confirmed";
    }
    const grade = newValues?.grade as string | undefined;
    if (grade) {
      return `Selected ${grade} contract`;
    }
  }

  if (entityType === "attendance") {
    const isPresent = newValues?.isPresent as boolean | undefined;
    return isPresent ? "Marked present" : "Marked absent";
  }

  return "Record updated";
}

export function StudentHistory({ classId, studentId }: StudentHistoryProps) {
  const { data: history, isLoading } = useQuery<AuditLog[]>({
    queryKey: [`/api/classes/${classId}/students/${studentId}/history`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Recent changes to this student's records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start space-x-4">
                <Skeleton className="h-6 w-16" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Recent changes to this student's records</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No history available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Recent changes to this student's records</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {history.map((log) => (
              <div
                key={log.id}
                className="flex items-start space-x-4 border-b pb-4 last:border-0"
              >
                <Badge
                  variant="secondary"
                  className={actionColors[log.action] || "bg-gray-100"}
                >
                  {actionLabels[log.action] || log.action}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {entityLabels[log.entityType] || log.entityType}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatChange(log.oldValues, log.newValues, log.entityType)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(log.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
