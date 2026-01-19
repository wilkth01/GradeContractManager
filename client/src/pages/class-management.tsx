import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Class, Assignment, GradeContract, User, AssignmentProgress, insertClassSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Circle, Edit2, ArrowLeft, TrendingUp, Target, Settings, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateAssignmentDialog } from "@/components/dialogs/create-assignment-dialog";
import { CreateGradeContractDialog } from "@/components/dialogs/create-grade-contract-dialog";
import { EditGradeContractDialog } from "@/components/dialogs/edit-grade-contract-dialog";
import { InviteStudentsDialog } from "@/components/dialogs/invite-students-dialog";
import { ImportStudentsDialog } from "@/components/dialogs/import-students-dialog";
import { ViewStudentProfileDialog } from "@/components/dialogs/view-student-profile-dialog";
import { UpdateAssignmentStatusDialog } from "@/components/dialogs/update-assignment-status-dialog";
import { ImportCanvasGradesDialog } from "@/components/dialogs/import-canvas-grades-dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EditAssignmentDialog } from "@/components/dialogs/edit-assignment-dialog";
import { ReorderAssignmentsDialog } from "@/components/dialogs/reorder-assignments-dialog";

// Edit Class Settings Dialog Component
function EditClassSettingsDialog({ classData }: { classData: Class }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  type FormData = {
    name: string;
    description?: string;
    semesterStartDate?: string;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(insertClassSchema.extend({
      name: insertClassSchema.shape.name,
      description: insertClassSchema.shape.description,
      semesterStartDate: insertClassSchema.shape.semesterStartDate,
    })),
    defaultValues: {
      name: classData.name,
      description: classData.description || "",
      semesterStartDate: classData.semesterStartDate || "2025-08-25",
    },
  });

  const updateClassMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("PATCH", `/api/classes/${classData.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classData.id}`] });
      toast({
        title: "Success",
        description: "Class settings updated successfully",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="text-base border-blue-600 text-black bg-white hover:bg-gray-100">
          <Settings className="h-5 w-5 mr-2" />
          Class Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Class Settings</DialogTitle>
          <DialogDescription>
            Update class name, description, and semester settings.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => updateClassMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="semesterStartDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Semester Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-sm text-muted-foreground">
                    This determines the current week calculation for engagement tracking
                  </p>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={updateClassMutation.isPending}
            >
              {updateClassMutation.isPending ? "Updating..." : "Update Settings"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ClassManagement() {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState<string>("");
  const [isInviteStudentsOpen, setIsInviteStudentsOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [contractFilter, setContractFilter] = useState<string>("all");
  const { user } = useAuth();
  const params = useParams<{ classId: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const parsedClassId = parseInt(params.classId);

  const { data: classData, isLoading: isLoadingClass } = useQuery<Class>({
    queryKey: [`/api/classes/${parsedClassId}`],
    enabled: !isNaN(parsedClassId),
  });

  const { data: assignments, isLoading: isLoadingAssignments } = useQuery<Assignment[]>({
    queryKey: [`/api/classes/${parsedClassId}/assignments`],
    enabled: !isNaN(parsedClassId),
  });

  const { data: contracts, isLoading: isLoadingContracts } = useQuery<GradeContract[]>({
    queryKey: [`/api/classes/${parsedClassId}/contracts`],
    enabled: !isNaN(parsedClassId),
  });

  const { data: students, isLoading: isLoadingStudents } = useQuery<User[]>({
    queryKey: [`/api/classes/${parsedClassId}/students`],
    enabled: !isNaN(parsedClassId),
  });

  // Fetch student contracts
  const { data: studentContracts } = useQuery({
    queryKey: [`/api/classes/${parsedClassId}/student-contracts`],
    enabled: !isNaN(parsedClassId) && !!students?.length,
  });

  // Fetch progress for all students
  const { data: studentsProgress } = useQuery<AssignmentProgress[]>({
    queryKey: [`/api/classes/${parsedClassId}/students/progress`],
    enabled: !isNaN(parsedClassId) && !!students?.length,
  });

  // Fetch attendance records for all students
  const { data: allAttendanceRecords } = useQuery({
    queryKey: [`/api/classes/${parsedClassId}/all-attendance`],
    enabled: !isNaN(parsedClassId) && !!students?.length,
  });

  // Mutation to update student absences
  const updateAbsencesMutation = useMutation({
    mutationFn: async ({ studentId, absences }: { studentId: number; absences: number }) => {
      const res = await apiRequest("POST", `/api/classes/${parsedClassId}/students/${studentId}/absences`, { absences });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${parsedClassId}/all-attendance`] });
      toast({
        title: "Success",
        description: "Absences updated successfully",
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

  // Add mutation for updating class description
  const updateDescriptionMutation = useMutation({
    mutationFn: async (newDescription: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/classes/${parsedClassId}`,
        { description: newDescription }
      );
      return res.json();
    },
    onSuccess: (updatedClass: Class) => {
      queryClient.setQueryData([`/api/classes/${parsedClassId}`], updatedClass);
      setIsEditingDescription(false);
      toast({
        title: "Success",
        description: "Class description updated successfully",
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

  // When class data is loaded, initialize description state
  useEffect(() => {
    if (classData?.description) {
      setDescription(classData.description);
    }
  }, [classData?.description]);

  const handleSaveDescription = () => {
    updateDescriptionMutation.mutate(description);
  };

  // Handle invalid class ID
  if (isNaN(parsedClassId)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              Invalid class ID. Please return to the dashboard and try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Handle loading state
  if (isLoadingClass || isLoadingAssignments || isLoadingContracts || isLoadingStudents) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Handle class not found
  if (!classData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              Could not find class with ID {parsedClassId}. Please return to the dashboard and try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Helper functions
  const getStudentContract = (studentId: number) => {
    if (!Array.isArray(studentContracts)) return null;
    const studentContract = studentContracts.find((sc: any) => sc.studentId === studentId);
    if (!studentContract) return null;
    return contracts?.find(c => c.id === studentContract.contractId);
  };

  const getAssignmentStatus = (assignment: Assignment, progress?: AssignmentProgress) => {
    if (!progress) {
      if (assignment.scoringType === "attendance") return "good-standing";
      return "not-submitted";
    }

    if (assignment.scoringType === "status") {
      switch (progress.status) {
        case 2: return "completed";
        case 1: return "in-progress";
        default: return "not-submitted";
      }
    } else if (assignment.scoringType === "attendance") {
      const currentAbsences = progress.numericGrade || 0;
      const maxAbsences = assignment.maxAbsences || 0;
      if (currentAbsences > maxAbsences) return "over-limit";
      if (currentAbsences === maxAbsences) return "at-limit";
      return "good-standing";
    } else {
      if (!progress.numericGrade) return "not-submitted";
      return "completed"; // For numeric grades, we always show the score
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden="true" />;
      case "in-progress":
        return <Circle className="h-6 w-6 text-yellow-600" aria-hidden="true" />;
      case "not-submitted":
        return <XCircle className="h-6 w-6 text-gray-400" aria-hidden="true" />;
      case "good-standing":
        return <CheckCircle2 className="h-6 w-6 text-green-600" aria-hidden="true" />;
      case "at-limit":
        return <Circle className="h-6 w-6 text-yellow-600" aria-hidden="true" />;
      case "over-limit":
        return <XCircle className="h-6 w-6 text-red-600" aria-hidden="true" />;
      default:
        return <XCircle className="h-6 w-6 text-gray-400" aria-hidden="true" />;
    }
  };

  const getAssignmentDetails = (assignmentRequirements: { id: number; comments?: string }[]) => {
    return assignmentRequirements
      .map(req => {
        const assignment = assignments?.find(a => a.id === req.id);
        if (!assignment) return null;
        return `${assignment.name}${req.comments ? ` (${req.comments})` : ''}`;
      })
      .filter(Boolean)
      .join("\n");
  };

  // Group assignments by module
  const groupedAssignments = assignments?.reduce((acc, assignment) => {
    const group = assignment.moduleGroup || "Ungrouped";
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

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
              onClick={() => setLocation('/instructor')}
              aria-label="Return to instructor dashboard"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Dashboard
            </Button>
          </nav>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">{classData?.name}</h1>
              <p className="text-lg opacity-90">Manage your class settings and contracts</p>
            </div>
            <div className="flex gap-3">
              <EditClassSettingsDialog classData={classData} />
              <Link href={`/instructor/class/${parsedClassId}/analytics`}>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base border-blue-600 text-black bg-white hover:bg-gray-100"
                  aria-label={`View analytics for ${classData?.name}`}
                >
                  <TrendingUp className="h-5 w-5 mr-2" aria-hidden="true" />
                  View Analytics
                </Button>
              </Link>
              <Link href={`/instructor/class/${parsedClassId}/engagement`}>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base border-blue-600 text-black bg-white hover:bg-gray-100"
                  aria-label={`View engagement dashboard for ${classData?.name}`}
                >
                  <Target className="h-5 w-5 mr-2" aria-hidden="true" />
                  Engagement Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto py-8" role="main">
        {/* Add description editor card at the top */}
        <section aria-labelledby="description-heading">
          <Card className="mb-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle id="description-heading" className="text-2xl font-bold">Course Description</CardTitle>
                <CardDescription className="text-base">
                  Provide detailed information about your class
                </CardDescription>
              </div>
            {!isEditingDescription && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingDescription(true)}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Description
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isEditingDescription ? (
              <div className="space-y-4">
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  editable={true}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditingDescription(false);
                      setDescription(classData?.description || "");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveDescription}
                    disabled={updateDescriptionMutation.isPending}
                  >
                    {updateDescriptionMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <RichTextEditor
                value={classData?.description || ""}
                editable={false}
              />
            )}
          </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="contracts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="contracts">Grade Contracts</TabsTrigger>
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="roster">Student Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="contracts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Grade Contracts</CardTitle>
                  <CardDescription>
                    Define requirements for each grade level (A, B, C)
                  </CardDescription>
                </div>
                {assignments && assignments.length > 0 ? (
                  <CreateGradeContractDialog
                    classId={parsedClassId}
                    assignments={assignments}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Add assignments before creating grade contracts
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {contracts?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No grade contracts defined yet. Click "Create Grade Contract" to define requirements for each grade level.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {["A", "B", "C"].map((grade) => {
                      const gradeContract = contracts?.find((c) => c.grade === grade);
                      return (
                        <Card key={grade}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <CardTitle className="text-lg">Grade {grade} Requirements</CardTitle>
                                {gradeContract ? (
                                  <CardDescription className="whitespace-pre-line">
                                    Required Assignments:
                                    {"\n"}
                                    {getAssignmentDetails(gradeContract.assignments)}
                                  </CardDescription>
                                ) : (
                                  <CardDescription className="text-muted-foreground">
                                    No requirements defined yet
                                  </CardDescription>
                                )}
                              </div>
                              {gradeContract && assignments && (
                                <EditGradeContractDialog
                                  classId={parsedClassId}
                                  contract={gradeContract}
                                  assignments={assignments}
                                />
                              )}
                            </div>
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assignments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Assignments</CardTitle>
                  <CardDescription>
                    Create and manage assignments for your class
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {assignments && assignments.length > 1 && (
                    <ReorderAssignmentsDialog classId={parsedClassId} assignments={assignments} />
                  )}
                  <CreateAssignmentDialog classId={parsedClassId} />
                </div>
              </CardHeader>
              <CardContent>
                {assignments?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No assignments yet. Click "Add Assignment" to create your first assignment.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedAssignments || {}).map(([group, groupAssignments]) => (
                      <div key={group}>
                        <h3 className="text-lg font-semibold mb-3">{group}</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {groupAssignments.map((assignment) => (
                            <Card key={assignment.id}>
                              <CardHeader className="flex flex-row items-start justify-between">
                                <div>
                                  <CardTitle className="text-base">{assignment.name}</CardTitle>
                                  <CardDescription className="text-xs">
                                    Scoring: {assignment.scoringType === "status" ? "Status-based" : "Numeric (1-100)"}
                                  </CardDescription>
                                </div>
                                <EditAssignmentDialog
                                  assignment={assignment}
                                  classId={parsedClassId}
                                />
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roster">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Student Progress</CardTitle>
                  <CardDescription>
                    Track student contracts and assignment completion
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setIsInviteStudentsOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Invite Students
                  </Button>
                  <ImportStudentsDialog classId={parsedClassId} />
                  <ImportCanvasGradesDialog classId={parsedClassId} />
                </div>
              </CardHeader>
              <CardContent>
                {!students?.length ? (
                  <p className="text-center text-muted-foreground py-8">
                    No students enrolled yet. Click "Import Students" to add students to this class.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {/* Search and Filter Controls */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search students by name..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={contractFilter} onValueChange={setContractFilter}>
                        <SelectTrigger className="w-full sm:w-[200px]">
                          <SelectValue placeholder="Filter by contract" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Students</SelectItem>
                          <SelectItem value="none">No Contract Selected</SelectItem>
                          {contracts?.map((contract) => (
                            <SelectItem key={contract.id} value={contract.grade}>
                              Grade {contract.grade} Contract
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Student List */}
                    {(() => {
                      // Extract last name - handles "LastName, FirstName" or "FirstName LastName" formats
                      const getLastName = (fullName: string) => {
                        if (fullName.includes(',')) {
                          // "Grossman, Abigail" -> "Grossman"
                          return fullName.split(',')[0].trim().toLowerCase();
                        }
                        // "Abigail Grossman" -> "Grossman"
                        return fullName.split(' ').slice(-1)[0].toLowerCase();
                      };

                      const filteredStudents = [...students]
                        .sort((a, b) => {
                          const lastNameA = getLastName(a.fullName);
                          const lastNameB = getLastName(b.fullName);
                          return lastNameA.localeCompare(lastNameB);
                        })
                        .filter((student) => {
                          const searchLower = studentSearch.toLowerCase();
                          const matchesSearch = studentSearch === "" ||
                            student.fullName.toLowerCase().includes(searchLower) ||
                            student.username.toLowerCase().includes(searchLower);
                          const studentContract = getStudentContract(student.id);
                          let matchesContract = true;
                          if (contractFilter === "none") {
                            matchesContract = !studentContract;
                          } else if (contractFilter !== "all") {
                            matchesContract = studentContract?.grade === contractFilter;
                          }
                          return matchesSearch && matchesContract;
                        });

                      if (filteredStudents.length === 0) {
                        return (
                          <p className="text-center text-muted-foreground py-8">
                            No students match your search or filter criteria.
                          </p>
                        );
                      }

                      return (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Showing {filteredStudents.length} of {students.length} student{students.length !== 1 ? 's' : ''}
                          </p>
                          {filteredStudents.map((student) => {
                            const contract = getStudentContract(student.id);
                            const studentProgress = studentsProgress?.filter(p => p.studentId === student.id) || [];

                            return (
                              <Card key={student.id} className="relative">
                                <CardHeader>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <CardTitle className="text-base">{student.fullName}</CardTitle>
                                      <CardDescription>{student.username}</CardDescription>
                                    </div>
                                    <div className="space-x-2">
                                      <ViewStudentProfileDialog
                                        student={student}
                                        classId={parsedClassId}
                                      />
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium">Selected Contract:</p>
                                        <p className="text-sm text-muted-foreground">
                                          {contract ? `Grade ${contract.grade}` : 'No contract selected'}
                                        </p>
                                      </div>
                                      {contract && contract.maxAbsences !== undefined && (
                                        <div className="flex items-center space-x-2">
                                          <label htmlFor={`absences-${student.id}`} className="text-sm font-medium">
                                            Absences:
                                          </label>
                                          <Input
                                            id={`absences-${student.id}`}
                                            type="number"
                                            min="0"
                                            className="w-20"
                                            defaultValue={
                                              Array.isArray(allAttendanceRecords)
                                                ? allAttendanceRecords.filter((r: any) => r.studentId === student.id && !r.isPresent).length
                                                : 0
                                            }
                                            onBlur={(e) => {
                                              const absences = parseInt(e.target.value) || 0;
                                              updateAbsencesMutation.mutate({ studentId: student.id, absences });
                                            }}
                                          />
                                          <span className="text-sm text-muted-foreground">
                                            / {contract.maxAbsences}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    {contract && (
                                      <div>
                                        <p className="font-medium mb-2">Required Assignments:</p>
                                        <div className="space-y-4">
                                          {/* Group assignments by moduleGroup */}
                                          {(() => {
                                            const groupedReqs = contract.assignments?.reduce((groups, req) => {
                                              const assignment = assignments?.find(a => a.id === req.id);
                                              if (!assignment) return groups;
                                              const group = assignment.moduleGroup || 'Uncategorized';
                                              if (!groups[group]) groups[group] = [];
                                              groups[group].push({ req, assignment });
                                              return groups;
                                            }, {} as Record<string, { req: { id: number; comments?: string }; assignment: Assignment }[]>);

                                            return Object.entries(groupedReqs || {}).map(([groupName, groupItems]) => {
                                              // Calculate group stats for this student
                                              const groupStats = groupItems.reduce(
                                                (stats, { assignment }) => {
                                                  const progress = studentProgress.find(p => p.assignmentId === assignment.id);
                                                  const status = getAssignmentStatus(assignment, progress);
                                                  if (status === "completed") stats.completed++;
                                                  else if (status === "in-progress") stats.inProgress++;
                                                  else stats.notSubmitted++;
                                                  return stats;
                                                },
                                                { completed: 0, inProgress: 0, notSubmitted: 0 }
                                              );
                                              const totalInGroup = groupItems.length;

                                              return (
                                                <div key={groupName} className="border-l-2 border-blue-200 pl-3">
                                                  <div className="flex items-center justify-between mb-2">
                                                    <span className="font-medium text-sm text-[#0072BC]">{groupName}</span>
                                                    <div className="flex items-center gap-3 text-xs">
                                                      <span className="flex items-center gap-1">
                                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                        {groupStats.completed}
                                                      </span>
                                                      <span className="flex items-center gap-1">
                                                        <Circle className="h-3 w-3 text-yellow-600" />
                                                        {groupStats.inProgress}
                                                      </span>
                                                      <span className="flex items-center gap-1">
                                                        <XCircle className="h-3 w-3 text-gray-400" />
                                                        {groupStats.notSubmitted}
                                                      </span>
                                                    </div>
                                                  </div>
                                                  {/* Mini progress bar */}
                                                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                                    <div className="flex h-1.5 rounded-full overflow-hidden">
                                                      <div className="bg-green-600" style={{ width: `${(groupStats.completed / totalInGroup) * 100}%` }} />
                                                      <div className="bg-yellow-500" style={{ width: `${(groupStats.inProgress / totalInGroup) * 100}%` }} />
                                                    </div>
                                                  </div>
                                                  <div className="space-y-1">
                                                    {groupItems.map(({ req, assignment }) => {
                                                      const assignmentProgress = studentProgress.find(p => p.assignmentId === assignment.id);
                                                      const status = getAssignmentStatus(assignment, assignmentProgress);

                                                      return (
                                                        <div key={assignment.id} className="flex items-center justify-between">
                                                          <div className="flex items-center space-x-2">
                                                            {assignment.scoringType === "status" && getStatusIcon(status)}
                                                            <span className="text-sm">
                                                              {assignment.name}
                                                              {req.comments && (
                                                                <span className="text-muted-foreground ml-1">
                                                                  ({req.comments})
                                                                </span>
                                                              )}
                                                            </span>
                                                          </div>
                                                          <div className="flex items-center space-x-2">
                                                            {assignmentProgress && assignment.scoringType === "numeric" && assignmentProgress.numericGrade !== null && (
                                                              <span className="text-sm mr-2">
                                                                Score: {parseFloat(assignmentProgress.numericGrade).toFixed(1)}
                                                              </span>
                                                            )}
                                                            <UpdateAssignmentStatusDialog
                                                              classId={parsedClassId}
                                                              studentId={student.id}
                                                              assignment={assignment}
                                                              currentProgress={assignmentProgress}
                                                            />
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Invite Students Dialog */}
      <InviteStudentsDialog
        open={isInviteStudentsOpen}
        onOpenChange={setIsInviteStudentsOpen}
        classId={parsedClassId}
        className={classData?.name || ""}
      />
    </div>
  );
}