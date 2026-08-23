import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Assignment } from "@shared/schema";
import {
  parseContractTable,
  interpretTable,
  buildContractDrafts,
  type ParsedContractTable,
  type InterpretedRow,
  type RequirementKind,
  type InterpretationContext,
} from "@shared/contract-import";
import { Loader2, TableProperties, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = { classId: number; assignments: Assignment[] };

const CONTRACT_GRADES = ["A", "B", "C"] as const;
const SKIP = "__skip__";

const KIND_LABELS: Record<RequirementKind, string> = {
  absences: "Absence limit",
  participation: "Participation sessions",
  "category-count": "Complete N in a module group",
  "category-average": "Average across a module group",
  assignment: "A specific assignment",
  unknown: "Skip this row",
};

interface ImportResult {
  created: string[];
  updated: { grade: string; movedStudents: number }[];
}

export function ImportContractTableDialog({ classId, assignments }: Props) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [table, setTable] = useState<ParsedContractTable | null>(null);
  const [rows, setRows] = useState<InterpretedRow[]>([]);
  const [gradeMap, setGradeMap] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const context: InterpretationContext = useMemo(
    () => ({
      categories: Array.from(
        new Set(assignments.map((a) => a.moduleGroup || "Uncategorized"))
      ).sort(),
      assignments: assignments.map((a) => ({
        id: a.id,
        name: a.name,
        moduleGroup: a.moduleGroup,
      })),
    }),
    [assignments]
  );

  function readTable() {
    setParseError(null);
    setResult(null);
    try {
      const parsed = parseContractTable(html);
      setTable(parsed);
      setRows(interpretTable(parsed, context));
      // A column headed "A" is grade A; anything else needs the instructor to
      // say which tier it is, rather than being guessed into one.
      setGradeMap(
        parsed.grades.map((g) =>
          (CONTRACT_GRADES as readonly string[]).includes(g.trim().toUpperCase())
            ? g.trim().toUpperCase()
            : SKIP
        )
      );
    } catch (err) {
      setTable(null);
      setRows([]);
      setParseError(err instanceof Error ? err.message : "Could not read that table");
    }
  }

  const updateRow = (index: number, patch: Partial<InterpretedRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );

  const draftResult = useMemo(() => {
    if (!table) return null;
    return buildContractDrafts(table, rows, context);
  }, [table, rows, context]);

  // Only columns the instructor has bound to a tier are imported, and a tier
  // can only be claimed once.
  const claimedGrades = gradeMap.filter((g) => g !== SKIP);
  const duplicateGrade = claimedGrades.length !== new Set(claimedGrades).size;

  const importContracts = useMutation({
    mutationFn: async () => {
      if (!draftResult) throw new Error("Nothing to import");
      const contracts = draftResult.drafts
        .map((draft, column) => ({ draft, grade: gradeMap[column] }))
        .filter(({ grade }) => grade !== SKIP)
        .map(({ draft, grade }) => ({
          grade,
          assignments: draft.assignments,
          maxAbsences: draft.maxAbsences,
          requiredParticipationSessions: draft.requiredParticipationSessions,
          categoryRequirements: draft.categoryRequirements,
        }));

      const res = await apiRequest("POST", `/api/classes/${classId}/contracts/import`, {
        contracts,
      });
      return (await res.json()) as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/contracts`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/student-contracts`] });
      const moved = data.updated.reduce((sum, u) => sum + u.movedStudents, 0);
      toast({
        title: "Contracts built",
        description: moved
          ? `${moved} student${moved === 1 ? "" : "s"} moved to the new terms.`
          : "Students can now choose one.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const rowWarnings = rows.flatMap((row) => row.warnings.map((w) => `${row.label}: ${w}`));
  const unresolved = rows.filter(
    (row) =>
      (row.kind === "category-count" || row.kind === "category-average") && !row.category
  ).length +
    rows.filter((row) => row.kind === "assignment" && !row.assignmentId).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <TableProperties className="h-4 w-4 mr-2" aria-hidden="true" />
          Build from syllabus table
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Build contracts from a summary table</DialogTitle>
          <DialogDescription>
            Paste the HTML of your syllabus's obligations table — one row per requirement, one
            column per tier. Every row is shown with how it was read, and nothing is created until
            you say so.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3 -mr-3">
          <div className="space-y-4">
            <div className="space-y-2">
              <Textarea
                rows={6}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<table>...</table>"
                className="font-mono text-xs"
                aria-label="Grade contract table HTML"
              />
              <Button onClick={readTable} disabled={!html.trim()} variant="secondary">
                Read the table
              </Button>
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Could not read that</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Done</AlertTitle>
                <AlertDescription>
                  {result.created.length > 0 && (
                    <p>Created grade {result.created.join(", ")}.</p>
                  )}
                  {result.updated.length > 0 && (
                    <p>
                      Republished grade{" "}
                      {result.updated.map((u) => u.grade).join(", ")} as a new version.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {table && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Columns</h3>
                  <div className="flex flex-wrap gap-3">
                    {table.grades.map((grade, column) => (
                      <div key={`${grade}-${column}`} className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">"{grade}"</span>
                        <Select
                          value={gradeMap[column] ?? SKIP}
                          onValueChange={(value) =>
                            setGradeMap((current) =>
                              current.map((g, i) => (i === column ? value : g))
                            )
                          }
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTRACT_GRADES.map((g) => (
                              <SelectItem key={g} value={g}>
                                Grade {g}
                              </SelectItem>
                            ))}
                            <SelectItem value={SKIP}>Skip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Rows</h3>
                  <div className="space-y-2">
                    {rows.map((row, index) => (
                      <div key={`${row.label}-${index}`} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-sm">{row.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {table.grades
                              .map((grade, column) =>
                                row.kind === "assignment"
                                  ? `${grade}: ${row.required[column] ? "required" : "—"}`
                                  : `${grade}: ${row.numbers[column] ?? "—"}${
                                      row.totals[column] != null ? ` of ${row.totals[column]}` : ""
                                    }`
                              )
                              .join("  ·  ")}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={row.kind}
                            onValueChange={(value) =>
                              updateRow(index, {
                                kind: value as RequirementKind,
                                category: null,
                                assignmentId: null,
                                warnings: [],
                              })
                            }
                          >
                            <SelectTrigger className="w-[260px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(KIND_LABELS) as RequirementKind[]).map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                  {KIND_LABELS[kind]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {(row.kind === "category-count" || row.kind === "category-average") && (
                            <Select
                              value={row.category ?? SKIP}
                              onValueChange={(value) =>
                                updateRow(index, {
                                  category: value === SKIP ? null : value,
                                  warnings: [],
                                })
                              }
                            >
                              <SelectTrigger className="w-[240px]">
                                <SelectValue placeholder="Which module group?" />
                              </SelectTrigger>
                              <SelectContent>
                                {context.categories.map((category) => (
                                  <SelectItem key={category} value={category}>
                                    {category}
                                  </SelectItem>
                                ))}
                                <SelectItem value={SKIP}>Not set</SelectItem>
                              </SelectContent>
                            </Select>
                          )}

                          {row.kind === "assignment" && (
                            <Select
                              value={row.assignmentId ? String(row.assignmentId) : SKIP}
                              onValueChange={(value) =>
                                updateRow(index, {
                                  assignmentId: value === SKIP ? null : Number(value),
                                  warnings: [],
                                })
                              }
                            >
                              <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Which assignment?" />
                              </SelectTrigger>
                              <SelectContent>
                                {assignments.map((assignment) => (
                                  <SelectItem key={assignment.id} value={String(assignment.id)}>
                                    {assignment.name}
                                  </SelectItem>
                                ))}
                                <SelectItem value={SKIP}>Not set</SelectItem>
                              </SelectContent>
                            </Select>
                          )}

                          {row.confidence === "close" && (
                            <span className="text-xs text-warn">Best guess — check it</span>
                          )}
                        </div>

                        {row.warnings.map((warning) => (
                          <p key={warning} className="text-xs text-warn">
                            {warning}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {(draftResult?.warnings.length || rowWarnings.length) > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <AlertTitle>Worth checking</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 space-y-1">
                        {draftResult?.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {draftResult && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">What will be created</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {draftResult.drafts.map((draft, column) => (
                        <div
                          key={`${draft.grade}-${column}`}
                          className={`rounded-md border p-3 text-sm ${
                            gradeMap[column] === SKIP ? "opacity-50" : ""
                          }`}
                        >
                          <p className="font-medium">
                            {gradeMap[column] === SKIP
                              ? `"${draft.grade}" — skipped`
                              : `Grade ${gradeMap[column]}`}
                          </p>
                          <ul className="text-muted-foreground mt-1 space-y-0.5">
                            <li>
                              {draft.maxAbsences === 0
                                ? "No absences allowed"
                                : `Up to ${draft.maxAbsences} absence${
                                    draft.maxAbsences === 1 ? "" : "s"
                                  }`}
                            </li>
                            {draft.requiredParticipationSessions > 0 && (
                              <li>{draft.requiredParticipationSessions} participation sessions</li>
                            )}
                            {draft.categoryRequirements.map((requirement) => (
                              <li key={requirement.category}>
                                {requirement.category}:{" "}
                                {[
                                  requirement.required != null && `${requirement.required} required`,
                                  requirement.minAverage != null &&
                                    `${requirement.minAverage} average`,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </li>
                            ))}
                            <li>{draft.assignments.length} assignments in scope</li>
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {table && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {unresolved > 0 && (
              <span className="text-xs text-warn mr-auto">
                {unresolved} row{unresolved === 1 ? "" : "s"} still unmatched — they will be left
                out.
              </span>
            )}
            {duplicateGrade && (
              <span className="text-xs text-bad mr-auto">
                Two columns are set to the same grade.
              </span>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              disabled={
                claimedGrades.length === 0 || duplicateGrade || importContracts.isPending
              }
              onClick={() => importContracts.mutate()}
            >
              {importContracts.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              )}
              Build {claimedGrades.length} contract{claimedGrades.length === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
