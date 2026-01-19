import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Class, Assignment, GradeContract, AssignmentProgress } from "@shared/schema";
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
import { Loader2, CheckCircle2, XCircle, Circle, ArrowLeft, Target, AlertTriangle } from "lucide-react";
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
  const { data: contracts, isLoading: isLoadingContracts } = useQuery<GradeContract[]>({
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

  // Fetch student's engagement intentions for this class
  const { data: engagementIntentions } = useQuery({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/engagement-intentions`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  // Fetch student's attendance records for this class
  const { data: attendanceRecords } = useQuery({
    queryKey: [`/api/classes/${parsedClassId}/students/${user?.id}/attendance`],
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
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">{classData.name}</h1>
              <p className="text-lg opacity-90">Your Contract and Progress</p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="text-base"
              onClick={() => setLocation(`/student/class/${parsedClassId}/engagement`)}
              aria-label="View engagement tracking for this class"
            >
              <Target className="h-5 w-5 mr-2" />
              Engagement Tracking
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto py-8" role="main">
        <div className="space-y-8">
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
                    {/* Engagement Intentions Requirements */}
                    {(currentContract.requiredEngagementIntentions || 0) > 0 && (
                      <div className="border-l-4 border-[#0072BC] pl-4 mb-6">
                        <h3 className="text-lg font-semibold text-[#0072BC] mb-2">Engagement Requirements</h3>
                        <div className="flex items-center space-x-4">
                          <div className="text-sm">
                            <span className="font-medium">
                              {Array.isArray(engagementIntentions) ? engagementIntentions.filter((intention: any) => intention.isFulfilled).length : 0}
                            </span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="font-medium">{currentContract.requiredEngagementIntentions || 0}</span>
                            <span className="text-muted-foreground"> fulfilled engagement intentions</span>
                          </div>
                          <div className="flex-1">
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-[#0072BC] h-2 rounded-full transition-all duration-300"
                                style={{ 
                                  width: `${Math.min(100, (Array.isArray(engagementIntentions) ? engagementIntentions.filter((intention: any) => intention.isFulfilled).length : 0) / (currentContract.requiredEngagementIntentions || 1) * 100)}%` 
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Attendance Requirements */}
                    {(currentContract.maxAbsences || 0) >= 0 && (
                      <div className="border-l-4 border-red-500 pl-4 mb-6">
                        <h3 className="text-lg font-semibold text-red-700 mb-2">Attendance Requirements</h3>
                        <div className="flex items-center space-x-4">
                          <div className="text-sm">
                            <span className="font-medium">
                              {Array.isArray(attendanceRecords) ? attendanceRecords.filter((record: any) => !record.isPresent).length : 0}
                            </span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="font-medium">{currentContract.maxAbsences || 0}</span>
                            <span className="text-muted-foreground"> absences allowed</span>
                          </div>
                          <div className="flex-1">
                            <div className="bg-gray-200 rounded-full h-2">
                              <div 
                                className="h-2 rounded-full transition-all duration-300 bg-red-600"
                                style={{ 
                                  width: `${Math.min(100, (Array.isArray(attendanceRecords) ? attendanceRecords.filter((record: any) => !record.isPresent).length : 0) / Math.max(1, currentContract.maxAbsences || 1) * 100)}%` 
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
                          }, {} as Record<string, { assignment: Assignment; req: { id: number; comments?: string } }[]>)
                        ).map(([group, groupAssignments]) => {
                          // Calculate group progress statistics
                          const groupStats = groupAssignments.reduce(
                            (stats, { assignment }) => {
                              const progress = studentProgress?.find(p => p.assignmentId === assignment.id);
                              const status = getAssignmentStatus(assignment, progress);
                              if (status === "completed") stats.completed++;
                              else if (status === "in-progress") stats.inProgress++;
                              else stats.notSubmitted++;
                              return stats;
                            },
                            { completed: 0, inProgress: 0, notSubmitted: 0 }
                          );
                          const totalInGroup = groupAssignments.length;

                          return (
                          <div key={group} className="space-y-4" role="region" aria-labelledby={`group-${group}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <h4 id={`group-${group}`} className="font-bold text-xl text-[#0072BC]">{group}</h4>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  <span className="font-medium">{groupStats.completed}</span>
                                  <span className="text-muted-foreground">Completed</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Circle className="h-4 w-4 text-yellow-600" />
                                  <span className="font-medium">{groupStats.inProgress}</span>
                                  <span className="text-muted-foreground">In Progress</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <XCircle className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium">{groupStats.notSubmitted}</span>
                                  <span className="text-muted-foreground">Remaining</span>
                                </div>
                              </div>
                            </div>
                            {/* Progress bar for the group */}
                            <div className="w-full bg-gray-200 rounded-full h-2.5">
                              <div className="flex h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-green-600 h-2.5"
                                  style={{ width: `${(groupStats.completed / totalInGroup) * 100}%` }}
                                />
                                <div
                                  className="bg-yellow-500 h-2.5"
                                  style={{ width: `${(groupStats.inProgress / totalInGroup) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
                              {groupAssignments.map(({ assignment, req }) => {
                                const progress = studentProgress?.find(
                                  p => p.assignmentId === assignment.id
                                );
                                const status = getAssignmentStatus(assignment, progress);
                                const statusLabel = getStatusLabel(status, assignment, progress);
                                
                                if (assignment.name.toLowerCase().includes('autobiography')) {
                                  console.log(`Tech Autobiography Debug:`, {
                                    assignmentId: assignment.id,
                                    assignmentName: assignment.name,
                                    scoringType: assignment.scoringType,
                                    progress: progress,
                                    status: status,
                                    statusLabel: statusLabel
                                  });
                                }

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
                                              pastDue ? "text-red-600 font-semibold" : "text-muted-foreground"
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
                                            <div className="px-3 py-2 rounded-md bg-gray-50 border text-base font-semibold">
                                              Score: {progress?.numericGrade ? parseFloat(progress.numericGrade).toFixed(1) : "Not submitted"}
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

const getAssignmentStatus = (assignment: Assignment, progress?: AssignmentProgress) => {
  if (!progress) {
    return "not-submitted";
  }

  if (assignment.scoringType === "status") {
    switch (progress.status) {
      case 2: return "completed";
      case 1: return "in-progress";
      default: return "not-submitted";
    }
  } else {
    if (!progress.numericGrade) return "not-submitted";
    return "completed";
  }
};

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

const getStatusLabel = (status: string, assignment?: Assignment, progress?: AssignmentProgress) => {
  switch (status) {
    case "completed":
      return "Successfully completed";
    case "in-progress":
      return "Work in progress";
    case "not-submitted":
      return "Not yet submitted";
    default:
      return "Not yet submitted";
  }
};

const isPastDue = (dueDate: Date | string | null | undefined): boolean => {
  if (!dueDate) return false;
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  // Set to end of due date day for comparison
  due.setHours(23, 59, 59, 999);
  return now > due;
};

const formatDueDate = (dueDate: Date | string | null | undefined): string => {
  if (!dueDate) return "";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};