import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Class, Assignment, GradeContract, AssignmentProgress, CategoryRequirement, SessionParticipation, StudentAbsences } from "@shared/schema";

type GradeContractWithCategories = GradeContract & { categoryRequirements?: CategoryRequirement[] | null };
import {
  getAssignmentDisplayState,
  getDisplayStateLabel,
  isOverAbsenceLimit,
  meetsParticipationBar,
  getParticipationLabel,
  DEFAULT_PARTICIPATION_BAR,
} from "@shared/constants";
import {
  computeCategoryAverage,
  isPastDue,
  evaluateStanding,
  formatAbsences,
} from "@shared/contract-evaluation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Circle, ArrowLeft, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

interface StudentContract {
  contractId: number | null;
  isConfirmed: boolean;
}

export default function StudentClassView() {
  const { user } = useAuth();
  const params = useParams<{ classId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const parsedClassId = parseInt(params.classId);

  // Fetch class details
  const { data: classData, isLoading: isLoadingClass } = useQuery<Class>({
    queryKey: [`/api/classes/${parsedClassId}`],
    enabled: !isNaN(parsedClassId),
  });

  // Fetch available contracts
  const { data: contracts, isLoading: isLoadingContracts } = useQuery<GradeContractWithCategories[]>({
    queryKey: [`/api/classes/${parsedClassId}/contracts`],
    enabled: !isNaN(parsedClassId),
  });

  // Fetch student's current contract
  const { data: studentContract, isLoading: isLoadingContract } = useQuery<StudentContract>({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/contract`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  // Fetch assignments only if we have a contract selected
  const { data: assignments, isLoading: isLoadingAssignments } = useQuery<Assignment[]>({
    queryKey: [`/api/classes/${parsedClassId}/assignments`],
    enabled: !isNaN(parsedClassId) && !!studentContract?.contractId,
  });

  // Fetch student's progress only if we have assignments
  const { data: studentProgress, isLoading: isLoadingProgress } = useQuery<AssignmentProgress[]>({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/progress`],
    enabled: !isNaN(parsedClassId) && !!assignments && !!user,
  });

  // Fetch student's attendance records for this class
  const { data: participationRecords } = useQuery<SessionParticipation[]>({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/participation`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  // Absences come from Qwickly by way of Canvas, so this is a single total.
  const { data: absenceRecord } = useQuery<StudentAbsences | null>({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/absences`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  const selectContractMutation = useMutation({
    mutationFn: async (contractId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${parsedClassId}/student-contract`,
        { contractId, isConfirmed: false }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/contract`],
      });
      toast({
        title: "Success",
        description: "Grade contract selected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const confirmContractMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${parsedClassId}/student-contract/confirm`,
        {}
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/contract`],
      });
      toast({
        title: "Success",
        description: "Grade contract confirmed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = isLoadingClass || isLoadingContracts || isLoadingContract || isLoadingAssignments || isLoadingProgress;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!classData || !contracts) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              Could not load class data. Please try again later.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentContract = studentContract?.contractId
    ? contracts.find(c => c.id === studentContract.contractId)
    : null;

  const absenceCount = Number(absenceRecord?.absences ?? 0);
  const participationCount = (participationRecords ?? []).filter(r =>
    meetsParticipationBar(r.participation, classData.participationBar)
  ).length;
  const maxAbsences = currentContract?.maxAbsences ?? 0;
  const overAbsenceLimit = isOverAbsenceLimit(absenceCount, maxAbsences);
  const requiredParticipation = currentContract?.requiredParticipationSessions ?? 0;

  // One evaluation, shared with the instructor roster and the progress
  // messages, so a student is never told two different things.
  const standing = evaluateStanding({
    contracts: (contracts ?? []).map(c => ({
      id: c.id,
      grade: c.grade,
      assignments: c.assignments,
      categoryRequirements: c.categoryRequirements,
      requiredParticipationSessions: c.requiredParticipationSessions,
      maxAbsences: c.maxAbsences,
    })),
    chosenContractId: studentContract?.contractId ?? null,
    assignments: assignments ?? [],
    progress: studentProgress ?? [],
    participationSessions: participationCount,
    absences: absenceCount,
    policy: {
      absencePenaltyThreshold: classData.absencePenaltyThreshold,
      absenceFailureThreshold: classData.absenceFailureThreshold,
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      
      <header className="bg-[#0072BC] text-white p-6" role="banner">
        <div className="container mx-auto">
          <nav className="flex items-center space-x-4 mb-6" aria-label="Breadcrumb">
            <Button
              variant="ghost"
              size="lg"
              className="text-white hover:text-white/80 text-base"
              onClick={() => setLocation('/student')}
              aria-label="Return to student dashboard"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </Button>
          </nav>
          <div>
            <h1 className="text-4xl font-bold mb-2">{classData.name}</h1>
            <p className="text-lg opacity-90">Your Contract and Progress</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto py-8" role="main">
        <div className="space-y-8">
          {/* Where you currently stand. This is the question the whole app
              exists to answer, so it goes first. */}
          {currentContract && (
            <section aria-labelledby="standing-heading">
              <Card className={`border-2 ${
                standing.chosen?.met
                  ? "border-green-500 bg-green-50/40 dark:bg-green-950/20"
                  : "border-amber-500 bg-amber-50/40 dark:bg-amber-950/20"
              }`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle id="standing-heading" className="text-2xl font-bold">
                        {standing.chosen?.met
                          ? `You are meeting your Grade ${currentContract.grade} contract`
                          : `Not yet meeting your Grade ${currentContract.grade} contract`}
                      </CardTitle>
                      <CardDescription className="text-base mt-1">
                        {standing.penalty === "failure" ? (
                          <span className="text-red-700 font-semibold">
                            {formatAbsences(absenceCount)} absences means automatic failure under
                            this course's attendance policy. Please speak with your instructor.
                          </span>
                        ) : standing.highestMet ? (
                          <>
                            On your current record you are earning a{" "}
                            <strong>{standing.effectiveGrade}</strong>
                            {standing.penalty === "letter-reduction" && (
                              <span className="text-red-700">
                                {" "}(reduced one letter from {standing.highestMet} for{" "}
                                {formatAbsences(absenceCount)} absences)
                              </span>
                            )}
                            .
                          </>
                        ) : (
                          "You are not currently meeting any grade contract in this class."
                        )}
                      </CardDescription>
                    </div>
                    {standing.chosen?.met ? (
                      <CheckCircle2 className="h-10 w-10 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-10 w-10 text-amber-600 flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>
                {(standing.chosen?.actionable.length || standing.chosen?.informational.length) ? (
                  <CardContent className="space-y-3">
                    {standing.chosen!.actionable.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-1">
                          To meet your Grade {currentContract.grade} contract:
                        </h3>
                        <ul className="list-disc list-inside space-y-1 text-base">
                          {standing.chosen!.actionable.map((item, i) => (
                            <li key={i}>{item.charAt(0).toUpperCase() + item.slice(1)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {standing.chosen!.informational.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Also worth knowing: {standing.chosen!.informational.join("; ")}.
                      </p>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            </section>
          )}

          {/* Class Description */}
          {classData.description && (
            <section aria-labelledby="course-info-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="course-info-heading" className="text-2xl font-bold">Course Information</CardTitle>
                </CardHeader>
                <CardContent className="text-base">
                  <RichTextEditor
                    value={classData.description}
                    editable={false}
                  />
                </CardContent>
              </Card>
            </section>
          )}

          <section aria-labelledby="contract-selection-heading">
            <Card>
              <CardHeader>
                <CardTitle id="contract-selection-heading" className="text-2xl font-bold">Grade Contract Selection</CardTitle>
                <CardDescription className="text-base">
                  Choose your target grade and view the requirements
                  {studentContract?.isConfirmed && (
                    <span className="text-green-600 ml-2 font-semibold" role="status" aria-live="polite">
                      (Contract Confirmed)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Select
                  value={studentContract?.contractId?.toString()}
                  onValueChange={(value) => selectContractMutation.mutate(parseInt(value))}
                  disabled={studentContract?.isConfirmed}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a grade contract" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts
                      .reduce((latest, contract) => {
                        const existing = latest.find(c => c.grade === contract.grade);
                        if (!existing || existing.version < contract.version) {
                          return [...latest.filter(c => c.grade !== contract.grade), contract];
                        }
                        return latest;
                      }, [] as typeof contracts)
                      .sort((a, b) => a.grade.localeCompare(b.grade))
                      .map((contract) => (
                        <SelectItem key={contract.id} value={contract.id.toString()}>
                          Grade {contract.grade}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {currentContract && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Current Contract: Grade {currentContract.grade}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Attendance and participation, both recorded per class session */}
                    {/* Neutral until the limit is actually exceeded. Framing a student
                        with zero absences in alarm red reads as a warning they have
                        done nothing to earn. */}
                    <div
                      className={`border-l-4 pl-4 mb-6 ${
                        overAbsenceLimit ? "border-red-500" : "border-border"
                      }`}
                    >
                      <h3
                        className={`text-lg font-semibold mb-2 ${
                          overAbsenceLimit ? "text-bad" : ""
                        }`}
                      >
                        Attendance
                      </h3>
                      <div className="flex items-center space-x-4">
                        <div className="text-sm">
                          <span className={overAbsenceLimit ? "font-medium text-bad" : "font-medium"}>
                            {absenceCount}
                          </span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="font-medium">{maxAbsences}</span>
                          <span className="text-muted-foreground"> absences allowed</span>
                          <span className="text-muted-foreground">
                            {" "}(from Qwickly; a late arrival counts as half)
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="bar-track rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                overAbsenceLimit ? "bg-red-600" : "bg-muted-foreground/50"
                              }`}
                              style={{
                                width: `${Math.min(100, (absenceCount / Math.max(1, maxAbsences)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {requiredParticipation > 0 && (
                      <div className="border-l-4 border-[#0072BC] dark:border-sky-400 pl-4 mb-6">
                        <h3 className="text-lg font-semibold text-brand mb-2">Participation</h3>
                        <div className="flex items-center space-x-4">
                          <div className="text-sm">
                            <span className="font-medium">{participationCount}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="font-medium">{requiredParticipation}</span>
                            <span className="text-muted-foreground">
                              {" "}sessions at {getParticipationLabel(classData.participationBar ?? DEFAULT_PARTICIPATION_BAR)} or above
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="bar-track rounded-full h-2">
                              <div
                                className="bg-[#0072BC] h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, (participationCount / requiredParticipation) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isLoadingAssignments ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-border" />
                      </div>
                    ) : assignments ? (
                      <div className="space-y-8">
                        <h3 className="text-2xl font-bold">Required Assignments</h3>
                        {Object.entries(
                          currentContract.assignments.reduce((groups, req) => {
                            const assignment = assignments.find(a => a.id === req.id);
                            if (!assignment) return groups;
                            const group = assignment.moduleGroup || 'Uncategorized';
                            return {
                              ...groups,
                              [group]: [...(groups[group] || []), { assignment, req }]
                            };
                          }, {} as Record<string, { assignment: Assignment; req: { id: number; comments?: string; minPoints?: number } }[]>)
                        ).map(([group, groupAssignments]) => {
                          // Calculate group progress statistics
                          const groupStats = groupAssignments.reduce(
                            (stats, { assignment }) => {
                              const progress = studentProgress?.find(p => p.assignmentId === assignment.id);
                              const status = getAssignmentDisplayState(assignment.scoringType, progress);
                              if (status === "completed") stats.completed++;
                              else if (status === "in-progress") stats.inProgress++;
                              else stats.notSubmitted++;
                              return stats;
                            },
                            { completed: 0, inProgress: 0, notSubmitted: 0 }
                          );
                          const totalInGroup = groupAssignments.length;

                          // Check if there's a category requirement for this group
                          const categoryReq = currentContract.categoryRequirements?.find(cr => cr.category === group);
                          const requiredCount = categoryReq?.required ?? 0;
                          const hasCountRequirement = requiredCount > 0;
                          const countMet = !hasCountRequirement || groupStats.completed >= requiredCount;

                          // Calculate average for numeric assignments in this group
                          const minAverage = categoryReq && 'minAverage' in categoryReq ? categoryReq.minAverage : undefined;
                          // Ungraded work is left out until it is past due, so the
                          // average reflects work actually done rather than reading
                          // as failing until every assignment is graded.
                          const averageStats = computeCategoryAverage(
                            groupAssignments.map(({ assignment }) => ({
                              numericGrade: studentProgress?.find(p => p.assignmentId === assignment.id)?.numericGrade,
                              dueDate: assignment.dueDate,
                            }))
                          );
                          const groupAverage = averageStats.average;
                          const averageMet = minAverage != null ? groupAverage >= minAverage : true;
                          const categoryMet = countMet && averageMet;

                          // If minAverage is set, show collapsed average display
                          if (minAverage != null) {
                            return (
                              <div key={group} className="space-y-4" role="region" aria-labelledby={`group-${group}`}>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <h4 id={`group-${group}`} className="font-bold text-xl text-brand">{group}</h4>
                                    <span className={`text-sm px-2 py-0.5 rounded-full ${
                                      categoryMet
                                        ? "pill-ok"
                                        : "pill-warn"
                                    }`}>
                                      {categoryMet ? "Met" : "Not Met"}
                                    </span>
                                  </div>
                                </div>
                                <Card className="border-2">
                                  <CardContent className="pt-6">
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className={`px-4 py-3 rounded-md border text-lg font-semibold ${
                                          averageStats.isEmpty
                                            ? "surface-neutral"
                                            : averageMet
                                              ? "surface-ok"
                                              : "surface-warn"
                                        }`}>
                                          {averageStats.isEmpty
                                            ? `Nothing graded yet - ${minAverage} average required`
                                            : `Average: ${groupAverage.toFixed(1)} / ${minAverage} required`}
                                        </div>
                                        {averageStats.isEmpty ? null : averageMet ? (
                                          <CheckCircle2 className="h-8 w-8 text-green-600" />
                                        ) : (
                                          <AlertTriangle className="h-8 w-8 text-amber-600" />
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                          <span>Progress toward {minAverage} average</span>
                                          <span>{Math.min(100, Math.round((groupAverage / minAverage) * 100))}%</span>
                                        </div>
                                        <div className="w-full bar-track rounded-full h-2.5">
                                          <div
                                            className={`h-2.5 rounded-full transition-all ${
                                              averageMet ? "bg-green-600" : "bg-amber-500"
                                            }`}
                                            style={{ width: `${Math.min(100, (groupAverage / minAverage) * 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {averageStats.isEmpty
                                          ? `${totalInGroup} assignment${totalInGroup !== 1 ? "s" : ""} in this group, none graded yet`
                                          : `Based on ${averageStats.graded} graded assignment${averageStats.graded !== 1 ? "s" : ""}` +
                                            (averageStats.missed > 0
                                              ? ` and ${averageStats.missed} past due with no grade (counted as 0)`
                                              : "") +
                                            (averageStats.pending > 0
                                              ? `. ${averageStats.pending} not yet due, so not counted.`
                                              : ".")}
                                      </p>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            );
                          }

                          return (
                          <div key={group} className="space-y-4" role="region" aria-labelledby={`group-${group}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <h4 id={`group-${group}`} className="font-bold text-xl text-brand">{group}</h4>
                                {hasCountRequirement && (
                                  <span className={`text-sm px-2 py-0.5 rounded-full ${
                                    categoryMet
                                      ? "pill-ok"
                                      : "pill-warn"
                                  }`}>
                                    {groupStats.completed}/{requiredCount} required
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  <span className="font-medium">{groupStats.completed}</span>
                                  <span className="text-muted-foreground">Completed</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Circle className="h-4 w-4 text-yellow-600" />
                                  <span className="font-medium">{groupStats.inProgress}</span>
                                  <span className="text-muted-foreground">WIP</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <XCircle className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium">{groupStats.notSubmitted}</span>
                                  <span className="text-muted-foreground">Remaining</span>
                                </div>
                              </div>
                            </div>
                            {/* Progress bar for the group */}
                            <div className="w-full bar-track rounded-full h-2.5">
                              <div className="flex h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-green-600 h-2.5"
                                  style={{ width: `${(groupStats.completed / (hasCountRequirement ? requiredCount : totalInGroup)) * 100}%` }}
                                />
                                <div
                                  className="bg-yellow-500 h-2.5"
                                  style={{ width: `${(groupStats.inProgress / (hasCountRequirement ? requiredCount : totalInGroup)) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
                              {groupAssignments.map(({ assignment, req }) => {
                                const progress = studentProgress?.find(
                                  p => p.assignmentId === assignment.id
                                );
                                const status = getAssignmentDisplayState(assignment.scoringType, progress);
                                const statusLabel = getDisplayStateLabel(status);

                                const pastDue = isPastDue(assignment.dueDate) && status !== "completed";

                                return (
                                  <Card
                                    key={assignment.id}
                                    className={`relative overflow-hidden border-2 hover:shadow-lg transition-shadow ${
                                      pastDue ? "border-red-500 bg-red-50/30" : ""
                                    }`}
                                    role="article"
                                    aria-labelledby={`assignment-${assignment.id}-title`}
                                  >
                                    {assignment.scoringType === "status" && (
                                      <div className={`absolute top-0 left-0 w-2 h-full ${
                                        pastDue ? "bg-red-600" :
                                          status === "completed" ? "bg-green-600" :
                                            status === "in-progress" ? "bg-yellow-600" :
                                              "bg-gray-400"
                                      }`} />
                                    )}
                                    <CardHeader className="pb-4">
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="space-y-2 flex-1">
                                          <CardTitle
                                            id={`assignment-${assignment.id}-title`}
                                            className="text-xl font-bold"
                                          >
                                            {assignment.name}
                                          </CardTitle>
                                          {req.comments && (
                                            <CardDescription className="text-base">
                                              {req.comments}
                                            </CardDescription>
                                          )}
                                          {assignment.dueDate && (
                                            <div className={`flex items-center gap-1.5 text-sm ${
                                              pastDue ? "text-bad font-semibold" : "text-muted-foreground"
                                            }`}>
                                              {pastDue && <AlertTriangle className="h-4 w-4" />}
                                              <span>
                                                {pastDue ? "Past Due: " : "Due: "}
                                                {formatDueDate(assignment.dueDate)}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                        {assignment.scoringType === "status" && (
                                          <div className="flex-shrink-0 flex items-center gap-2">
                                            {getStatusIcon(status)}
                                            <span className="sr-only">{statusLabel}</span>
                                          </div>
                                        )}
                                      </div>
                                    </CardHeader>
                                    <CardContent className="pt-0">
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          {assignment.scoringType === "status" ? (
                                            <div className={`px-3 py-2 rounded-md border text-base font-semibold ${
                                              status === "completed" ? "status-completed" :
                                                status === "in-progress" ? "status-in-progress" :
                                                  "status-not-submitted"
                                            }`}>
                                              {statusLabel}
                                            </div>
                                          ) : (
                                            <div className="space-y-2 w-full">
                                              {(() => {
                                                const currentPoints = progress?.numericGrade ? parseFloat(progress.numericGrade) : 0;
                                                const minRequired = req.minPoints;
                                                const meetsRequirement = minRequired ? currentPoints >= minRequired : true;

                                                return (
                                                  <>
                                                    <div className="flex items-center justify-between">
                                                      <div className={`px-3 py-2 rounded-md border text-base font-semibold ${
                                                        !progress?.numericGrade ? "surface-neutral" :
                                                          meetsRequirement ? "surface-ok" :
                                                            "surface-warn"
                                                      }`}>
                                                        Score: {progress?.numericGrade ? currentPoints.toFixed(1) : "Not submitted"}
                                                        {minRequired && progress?.numericGrade && (
                                                          <span className="ml-1 text-sm">
                                                            / {minRequired} required
                                                          </span>
                                                        )}
                                                      </div>
                                                      {minRequired && progress?.numericGrade && (
                                                        meetsRequirement ? (
                                                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                                                        ) : (
                                                          <AlertTriangle className="h-6 w-6 text-amber-600" />
                                                        )
                                                      )}
                                                    </div>
                                                    {minRequired && (
                                                      <div className="space-y-1">
                                                        <div className="flex justify-between text-xs text-muted-foreground">
                                                          <span>Progress toward {minRequired} points</span>
                                                          <span>{Math.min(100, Math.round((currentPoints / minRequired) * 100))}%</span>
                                                        </div>
                                                        <div className="w-full bar-track rounded-full h-2">
                                                          <div
                                                            className={`h-2 rounded-full transition-all ${
                                                              meetsRequirement ? "bg-green-600" : "bg-amber-500"
                                                            }`}
                                                            style={{ width: `${Math.min(100, (currentPoints / minRequired) * 100)}%` }}
                                                          />
                                                        </div>
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                        {progress && progress.attempts && progress.attempts > 0 && (
                                          <p className="text-base text-muted-foreground">
                                            <span className="font-medium">Attempts:</span> {progress.attempts}
                                          </p>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        )})}
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-center py-8">
                        No assignments found for this contract
                      </div>
                    )}

                    {!studentContract?.isConfirmed && studentContract?.contractId && (
                      <Button
                        className="w-full mt-6"
                        onClick={() => confirmContractMutation.mutate()}
                        disabled={confirmContractMutation.isPending}
                      >
                        Confirm Grade Contract Selection
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden="true" />;
    case "in-progress":
      return <Circle className="h-12 w-12 text-yellow-600" aria-hidden="true" />;
    case "not-submitted":
      return <XCircle className="h-12 w-12 text-gray-400" aria-hidden="true" />;
    default:
      return <XCircle className="h-12 w-12 text-gray-400" aria-hidden="true" />;
  }
};

const formatDueDate = (dueDate: Date | string | null | undefined): string => {
  if (!dueDate) return "";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};