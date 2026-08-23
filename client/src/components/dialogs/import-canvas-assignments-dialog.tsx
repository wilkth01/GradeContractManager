import { useState, useMemo, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MAX_NUMERIC_GRADE } from "@shared/constants";
import { Loader2, CloudDownload, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = { classId: number };

interface Proposal {
  canvasAssignmentId: number;
  name: string;
  moduleGroup: string;
  scoringType: "status" | "numeric";
  pointsPossible: number | null;
  dueDate: string | null;
  alreadyImported: boolean;
  portalAssignmentId: number | null;
}

interface ImportableResponse {
  proposals: Proposal[];
  moduleGroups: string[];
}

interface ImportResult {
  created: { id: number; name: string }[];
  skipped: { name: string; reason: string }[];
}

/** What the instructor may change before an assignment is created. */
type Edits = Record<number, { name: string; moduleGroup: string; scoringType: "status" | "numeric" }>;

export function ImportCanvasAssignmentsDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Edits>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ImportableResponse>({
    queryKey: [`/api/classes/${classId}/canvas/importable-assignments`],
    enabled: open,
    retry: false,
  });

  // Seed the editable fields from what Canvas says, once the list arrives.
  useEffect(() => {
    if (!data) return;
    setEdits((current) => {
      const next = { ...current };
      for (const proposal of data.proposals) {
        if (!next[proposal.canvasAssignmentId]) {
          next[proposal.canvasAssignmentId] = {
            name: proposal.name,
            moduleGroup: proposal.moduleGroup,
            scoringType: proposal.scoringType,
          };
        }
      }
      return next;
    });
  }, [data]);

  const importable = useMemo(
    () => (data?.proposals ?? []).filter((p) => !p.alreadyImported),
    [data]
  );
  const already = useMemo(
    () => (data?.proposals ?? []).filter((p) => p.alreadyImported),
    [data]
  );

  // Canvas's own groups plus this class's, so an import can be filed alongside
  // work that is already here instead of starting a parallel set of names.
  const groupOptions = useMemo(() => {
    const names = new Set<string>(data?.moduleGroups ?? []);
    for (const proposal of data?.proposals ?? []) names.add(proposal.moduleGroup);
    for (const edit of Object.values(edits)) if (edit.moduleGroup) names.add(edit.moduleGroup);
    return Array.from(names).sort();
  }, [data, edits]);

  const editFor = (proposal: Proposal) =>
    edits[proposal.canvasAssignmentId] ?? {
      name: proposal.name,
      moduleGroup: proposal.moduleGroup,
      scoringType: proposal.scoringType,
    };

  const updateEdit = (id: number, patch: Partial<Edits[number]>) =>
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const importAssignments = useMutation({
    mutationFn: async () => {
      const chosen = importable.filter((p) => selected.has(p.canvasAssignmentId));
      const res = await apiRequest("POST", `/api/classes/${classId}/canvas/import-assignments`, {
        assignments: chosen.map((proposal) => {
          const edit = editFor(proposal);
          return {
            canvasAssignmentId: proposal.canvasAssignmentId,
            name: edit.name.trim(),
            moduleGroup: edit.moduleGroup.trim() || null,
            scoringType: edit.scoringType,
            dueDate: proposal.dueDate,
          };
        }),
      });
      return (await res.json()) as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/assignments`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/canvas/importable-assignments`],
      });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/canvas/assignments`] });
      toast({
        title: `Created ${data.created.length} assignment${data.created.length === 1 ? "" : "s"}`,
        description: data.skipped.length
          ? `${data.skipped.length} skipped.`
          : "Grades will pull for these without any further mapping.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const byGroup = useMemo(() => {
    const groups = new Map<string, Proposal[]>();
    for (const proposal of importable) {
      groups.set(proposal.moduleGroup, [...(groups.get(proposal.moduleGroup) ?? []), proposal]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [importable]);

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
          <CloudDownload className="h-4 w-4 mr-2" aria-hidden="true" />
          Import from Canvas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import assignments from Canvas</DialogTitle>
          <DialogDescription>
            Everything in the linked Canvas course, with the module group and scoring type each
            would arrive with. Imported assignments stay linked to Canvas, so grades pull without
            a separate mapping step.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Reading the Canvas course...
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not read Canvas</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>
              Created {result.created.length} assignment{result.created.length === 1 ? "" : "s"}
            </AlertTitle>
            {result.skipped.length > 0 && (
              <AlertDescription>
                <ul className="list-disc pl-4 mt-1">
                  {result.skipped.map((s) => (
                    <li key={s.name}>
                      {s.name} — {s.reason}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                {importable.length} available to import
                {already.length > 0 && `, ${already.length} already here`}
              </span>
              {importable.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(
                      selected.size === importable.length
                        ? new Set()
                        : new Set(importable.map((p) => p.canvasAssignmentId))
                    )
                  }
                >
                  {selected.size === importable.length ? "Select none" : "Select all"}
                </Button>
              )}
            </div>

            {/* min-h-0 is load-bearing: a flex item defaults to min-height:auto,
                which refuses to shrink below its content, so the area would grow
                past the dialog and clip the rows instead of scrolling them. */}
            <ScrollArea className="flex-1 min-h-0 pr-3 -mr-3">
              {importable.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Every published Canvas assignment is already in this class.
                </p>
              ) : (
                <div className="space-y-6">
                  {byGroup.map(([group, proposals]) => (
                    <div key={group}>
                      <h3 className="text-sm font-semibold mb-2">{group}</h3>
                      <div className="space-y-2">
                        {proposals.map((proposal) => {
                          const edit = editFor(proposal);
                          const isSelected = selected.has(proposal.canvasAssignmentId);
                          return (
                            <div
                              key={proposal.canvasAssignmentId}
                              className="flex items-start gap-3 rounded-md border p-3"
                            >
                              <Checkbox
                                className="mt-1"
                                checked={isSelected}
                                onCheckedChange={() => toggle(proposal.canvasAssignmentId)}
                                aria-label={`Import ${proposal.name}`}
                              />
                              <div className="min-w-0 flex-1 space-y-2">
                                <Input
                                  value={edit.name}
                                  onChange={(e) =>
                                    updateEdit(proposal.canvasAssignmentId, {
                                      name: e.target.value,
                                    })
                                  }
                                  aria-label={`Name for ${proposal.name}`}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <Select
                                    value={edit.moduleGroup}
                                    onValueChange={(value) =>
                                      updateEdit(proposal.canvasAssignmentId, {
                                        moduleGroup: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-[220px]">
                                      <SelectValue placeholder="Module group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {groupOptions.map((name) => (
                                        <SelectItem key={name} value={name}>
                                          {name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Select
                                    value={edit.scoringType}
                                    onValueChange={(value) =>
                                      updateEdit(proposal.canvasAssignmentId, {
                                        scoringType: value as "status" | "numeric",
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-[260px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="status">
                                        Successfully Completed / WIP / Missing
                                      </SelectItem>
                                      <SelectItem value="numeric">
                                        Numeric (0-{MAX_NUMERIC_GRADE})
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>

                                  <span className="text-xs text-muted-foreground">
                                    {proposal.pointsPossible != null
                                      ? `${proposal.pointsPossible} pts in Canvas`
                                      : "no point value"}
                                    {proposal.dueDate &&
                                      ` · due ${new Date(proposal.dueDate).toLocaleDateString()}`}
                                  </span>
                                </div>
                                {/* The numeric scale here is 0-4, so a bigger
                                    Canvas total cannot be carried across. */}
                                {edit.scoringType === "numeric" &&
                                  proposal.pointsPossible != null &&
                                  proposal.pointsPossible > MAX_NUMERIC_GRADE && (
                                    <p className="text-xs text-warn">
                                      Canvas scores this out of {proposal.pointsPossible}, above
                                      this app's {MAX_NUMERIC_GRADE}-point scale. Pulled grades
                                      will be capped at {MAX_NUMERIC_GRADE}.
                                    </p>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {already.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Already in this class
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {already.map((proposal) => (
                      <li key={proposal.canvasAssignmentId}>{proposal.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                disabled={selected.size === 0 || importAssignments.isPending}
                onClick={() => importAssignments.mutate()}
              >
                {importAssignments.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                )}
                Create {selected.size} assignment{selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
