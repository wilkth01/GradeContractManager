import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, DownloadCloud, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";

type Props = { classId: number };

interface CanvasAssignmentOption {
  id: number;
  name: string;
  pointsPossible: number | null;
  group: string;
}

interface PortalAssignment {
  id: number;
  name: string;
  moduleGroup: string | null;
  scoringType: "status" | "numeric";
  canvasAssignmentId: number | null;
}

interface AssignmentsResponse {
  canvasAssignments: CanvasAssignmentOption[];
  portalAssignments: PortalAssignment[];
  absenceCanvasAssignmentId: number | null;
}

interface PulledChange {
  studentId: number;
  studentName: string;
  assignmentId: number;
  assignmentName: string;
  currentValue: string | null;
  newValue: string;
  convertedNumeric: number | null;
  convertedStatus: number | null;
  warning?: string;
}

interface PullResponse {
  gradeChanges: PulledChange[];
  absenceChanges: { studentName: string; currentAbsences: number; newAbsences: number }[];
  summary: {
    mappedAssignments: number;
    studentsMatched: number;
    gradeChanges: number;
    absenceChanges: number;
    unmatchedCanvasUsers: number;
    ungraded: number;
  };
}

export function CanvasGradesDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [includeAbsences, setIncludeAbsences] = useState(true);
  const [applied, setApplied] = useState<{ appliedGrades: number; appliedAbsences: number } | null>(
    null
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AssignmentsResponse>({
    queryKey: [`/api/classes/${classId}/canvas/assignments`],
    enabled: open,
    retry: false,
  });

  const setMapping = useMutation({
    mutationFn: async (mapping: { assignmentId: number; canvasAssignmentId: number | null }) => {
      await apiRequest("PUT", `/api/classes/${classId}/canvas/assignment-map`, {
        mappings: [mapping],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/canvas/assignments`],
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not map", description: err.message, variant: "destructive" });
    },
  });

  const preview = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/canvas/pull-preview`, {});
      return (await res.json()) as PullResponse;
    },
    onError: (err: Error) => {
      toast({ title: "Could not pull", description: err.message, variant: "destructive" });
    },
  });

  const commit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/canvas/pull-commit`, {
        skipAssignmentIds: Array.from(skipped),
        includeAbsences,
      });
      return (await res.json()) as { appliedGrades: number; appliedAbsences: number };
    },
    onSuccess: (result) => {
      setApplied(result);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/students/progress`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/absences`] });
      toast({
        title: "Grades imported",
        description: `${result.appliedGrades} grades, ${result.appliedAbsences} absence totals.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const mappedCount = (data?.portalAssignments ?? []).filter(
    (a) => a.canvasAssignmentId != null
  ).length;

  // Assignments are grouped by what an import would do to them, so a preview of
  // 200 rows is still reviewable.
  const byAssignment = new Map<number, PulledChange[]>();
  for (const change of preview.data?.gradeChanges ?? []) {
    byAssignment.set(change.assignmentId, [
      ...(byAssignment.get(change.assignmentId) ?? []),
      change,
    ]);
  }

  const toggleSkip = (assignmentId: number) => {
    const next = new Set(skipped);
    if (next.has(assignmentId)) next.delete(assignmentId);
    else next.add(assignmentId);
    setSkipped(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setApplied(null);
          setSkipped(new Set());
          preview.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <DownloadCloud className="h-4 w-4 mr-2" />
          Pull Grades
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pull Grades from Canvas</DialogTitle>
          <DialogDescription>
            Map each assignment to its Canvas counterpart once, then pull whenever you like.
            Nothing is written until you review what would change.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Canvas unavailable</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {applied ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>
                {applied.appliedGrades} grades and {applied.appliedAbsences} absence totals
                imported
              </AlertTitle>
            </Alert>
          ) : preview.data ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  ["Students matched", preview.data.summary.studentsMatched],
                  ["Grade changes", preview.data.summary.gradeChanges],
                  ["Absence changes", preview.data.summary.absenceChanges],
                  ["Not yet graded", preview.data.summary.ungraded],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border rounded-md p-3">
                    <div className="text-2xl font-bold">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {preview.data.summary.unmatchedCanvasUsers > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>
                    {preview.data.summary.unmatchedCanvasUsers} Canvas students not linked
                  </AlertTitle>
                  <AlertDescription>
                    Their grades are not being imported. Import the roster from Canvas to
                    link them.
                  </AlertDescription>
                </Alert>
              )}

              <ScrollArea className="max-h-[35vh] border rounded-md">
                <div className="divide-y">
                  {Array.from(byAssignment.entries()).map(([assignmentId, changes]) => (
                    <div key={assignmentId} className="p-3 flex items-start gap-3">
                      <Checkbox
                        checked={!skipped.has(assignmentId)}
                        onCheckedChange={() => toggleSkip(assignmentId)}
                        aria-label={`Import ${changes[0].assignmentName}`}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{changes[0].assignmentName}</p>
                        <p className="text-sm text-muted-foreground">
                          {changes.length} student{changes.length === 1 ? "" : "s"}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          {changes.slice(0, 5).map((change, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              {change.studentName}: {change.currentValue ?? "none"}
                              {" \u2192 "}
                              <span
                                className={change.warning ? "text-amber-700" : "text-green-700"}
                              >
                                {change.convertedNumeric ?? change.convertedStatus}
                              </span>
                              {change.warning ? ` (${change.warning})` : ""}
                            </p>
                          ))}
                          {changes.length > 5 && (
                            <p className="text-xs text-muted-foreground">
                              ...and {changes.length - 5} more
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {preview.data.absenceChanges.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeAbsences}
                    onCheckedChange={(v) => setIncludeAbsences(v === true)}
                  />
                  Also import {preview.data.absenceChanges.length} absence total
                  {preview.data.absenceChanges.length === 1 ? "" : "s"}
                </label>
              )}
            </>
          ) : (
            data && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {mappedCount} of {data.portalAssignments.length} assignments mapped. Every
                  Canvas assignment is listed, whatever group it is filed under.
                </p>
                <ScrollArea className="max-h-[45vh] border rounded-md">
                  <div className="divide-y">
                    {data.portalAssignments.map((assignment) => (
                      <div key={assignment.id} className="p-3 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[180px]">
                          <p className="font-medium text-sm">{assignment.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {assignment.moduleGroup ?? "Ungrouped"} &middot; {assignment.scoringType}
                          </p>
                        </div>
                        <Select
                          value={
                            assignment.canvasAssignmentId
                              ? String(assignment.canvasAssignmentId)
                              : "__none__"
                          }
                          onValueChange={(value) =>
                            setMapping.mutate({
                              assignmentId: assignment.id,
                              canvasAssignmentId: value === "__none__" ? null : parseInt(value),
                            })
                          }
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue placeholder="Not mapped" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Not mapped</SelectItem>
                            {data.canvasAssignments.map((canvas) => (
                              <SelectItem key={canvas.id} value={String(canvas.id)}>
                                {canvas.name}
                                {canvas.pointsPossible != null ? ` (${canvas.pointsPossible} pts)` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )
          )}
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {!applied &&
            (preview.data ? (
              <Button onClick={() => commit.mutate()} disabled={commit.isPending}>
                {commit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import{" "}
                {preview.data.gradeChanges.filter((c) => !skipped.has(c.assignmentId)).length}{" "}
                changes
              </Button>
            ) : (
              <Button
                onClick={() => preview.mutate()}
                disabled={preview.isPending || mappedCount === 0}
              >
                {preview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Preview changes
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
