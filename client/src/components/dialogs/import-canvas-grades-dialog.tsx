import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Assignment } from "@shared/schema";
import { parseCSV, extractAssignmentColumns, stringSimilarity } from "@/lib/csv-parser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  AlertCircle,
  Loader2,
  BookOpen,
  Users,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  UserX,
  Sparkles,
} from "lucide-react";

type Props = {
  classId: number;
  trigger?: React.ReactNode;
};

// Types matching server-side definitions
interface NormalizedStudent {
  sourceId: string;
  displayName: string;
  email?: string;
  sisId?: string;
  username?: string;
}

interface NormalizedGrade {
  studentSourceId: string;
  assignmentSourceId: string;
  rawValue: string;
  sourceType: 'csv' | 'api';
}

interface NormalizedGradeData {
  students: NormalizedStudent[];
  assignments: string[];
  grades: NormalizedGrade[];
}

interface AssignmentMapping {
  canvasColumn: string;
  portalAssignment: Assignment | null;
  gradingType: 'points' | 'percentage' | 'letter' | 'status';
  mappingTarget?: 'assignment' | 'absences';
}

interface AbsenceChange {
  studentId: number;
  studentName: string;
  currentAbsences: number;
  newAbsences: number;
}

interface GradeChange {
  studentId: number;
  studentName: string;
  assignmentId: number;
  assignmentName: string;
  currentValue: string | null;
  newValue: string;
  convertedStatus: number | null;
  convertedNumeric: number | null;
}

interface ImportPreview {
  matchedStudents: {
    csvStudent: NormalizedStudent;
    matchedStudent: { id: number; fullName: string; username: string } | null;
    matchType: string;
    confidence: number;
  }[];
  unmatchedStudents: NormalizedStudent[];
  gradeChanges: GradeChange[];
  absenceChanges: AbsenceChange[];
  summary: {
    totalStudents: number;
    matchedStudents: number;
    unmatchedStudents: number;
    totalGradeUpdates: number;
    totalAbsenceUpdates: number;
    assignmentsMapped: number;
  };
}

interface ImportResult {
  success: boolean;
  processedStudents: number;
  processedGrades: number;
  processedAbsences: number;
  skippedStudents: string[];
  errors: { student: string; assignment: string; error: string }[];
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Not Submitted',
  1: 'Not Submitted',
  2: 'Work-in-Progress',
  3: 'Successfully Completed'
};

export function ImportCanvasGradesDialog({ classId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [error, setError] = useState<string | null>(null);

  // CSV parsing state
  const [normalizedData, setNormalizedData] = useState<NormalizedGradeData | null>(null);
  const [mappings, setMappings] = useState<AssignmentMapping[]>([]);

  // Preview state
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Result state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch portal assignments
  const { data: portalAssignments, isLoading: isLoadingAssignments } = useQuery<Assignment[]>({
    queryKey: [`/api/classes/${classId}/assignments`],
    enabled: open,
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/canvas/preview`,
        { normalizedData, mappings }
      );
      return res.json() as Promise<ImportPreview>;
    },
    onSuccess: (data) => {
      setPreview(data);
      setActiveTab("preview");
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview available");
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/canvas/import`,
        {
          gradeChanges: preview.gradeChanges,
          absenceChanges: preview.absenceChanges,
        }
      );
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/students/progress`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/attendance`] });
      setActiveTab("results");
      const parts = [];
      if (result.processedGrades > 0) parts.push(`${result.processedGrades} grades`);
      if (result.processedAbsences > 0) parts.push(`${result.processedAbsences} absence records`);
      toast({
        title: "Import Successful",
        description: `Updated ${parts.join(' and ')} for ${result.processedStudents} students`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetState = () => {
    setNormalizedData(null);
    setMappings([]);
    setPreview(null);
    setImportResult(null);
    setError(null);
    setActiveTab("upload");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const { headers, rows } = parseCSV(csvText);

        // Extract assignment columns (filter out system columns)
        const assignmentColumns = extractAssignmentColumns(headers);

        if (assignmentColumns.length === 0) {
          throw new Error("No assignment columns found in CSV. Make sure your Canvas export includes grade columns.");
        }

        // Build normalized data
        const students: NormalizedStudent[] = [];
        const grades: NormalizedGrade[] = [];

        rows.forEach((row, index) => {
          const studentName = row['Student'] || '';
          if (!studentName) return;

          const student: NormalizedStudent = {
            sourceId: `row-${index}`,
            displayName: studentName,
            email: row['SIS Login ID'] || undefined,
            sisId: row['SIS User ID'] || undefined,
            username: row['SIS Login ID'] || undefined,
          };
          students.push(student);

          // Extract grades for this student
          assignmentColumns.forEach(column => {
            const value = row[column];
            if (value && value.trim()) {
              grades.push({
                studentSourceId: student.sourceId,
                assignmentSourceId: column,
                rawValue: value.trim(),
                sourceType: 'csv'
              });
            }
          });
        });

        setNormalizedData({
          students,
          assignments: assignmentColumns,
          grades
        });

        // Initialize mappings with auto-matching
        const initialMappings: AssignmentMapping[] = assignmentColumns.map(column => {
          // Try to auto-match by name similarity
          let bestMatch: Assignment | null = null;
          let bestScore = 0;

          if (portalAssignments) {
            for (const assignment of portalAssignments) {
              const similarity = stringSimilarity(column, assignment.name);
              if (similarity > bestScore && similarity >= 70) {
                bestScore = similarity;
                bestMatch = assignment;
              }
            }
          }

          return {
            canvasColumn: column,
            portalAssignment: bestMatch,
            gradingType: 'points' as const
          };
        });

        setMappings(initialMappings);
        setActiveTab("mapping");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV file");
      }
    };

    reader.onerror = () => {
      setError("Failed to read file");
    };

    reader.readAsText(file);
  };

  const updateMapping = (index: number, field: keyof AssignmentMapping, value: any) => {
    setMappings(prev => prev.map((mapping, i) =>
      i === index ? { ...mapping, [field]: value } : mapping
    ));
  };

  const autoMatchAll = () => {
    if (!portalAssignments) return;

    setMappings(prev => prev.map(mapping => {
      if (mapping.portalAssignment) return mapping; // Skip already mapped

      let bestMatch: Assignment | null = null;
      let bestScore = 0;

      for (const assignment of portalAssignments) {
        const similarity = stringSimilarity(mapping.canvasColumn, assignment.name);
        if (similarity > bestScore && similarity >= 60) {
          bestScore = similarity;
          bestMatch = assignment;
        }
      }

      return { ...mapping, portalAssignment: bestMatch };
    }));
  };

  const mappedCount = mappings.filter(m => m.portalAssignment || m.mappingTarget === 'absences').length;
  const canPreview = mappedCount > 0 && normalizedData;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) resetState();
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Import Canvas Grades
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Import Canvas Gradebook
          </DialogTitle>
          <DialogDescription>
            Import grades from your Canvas gradebook export
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">1. Upload</TabsTrigger>
            <TabsTrigger value="mapping" disabled={!normalizedData}>
              2. Map
            </TabsTrigger>
            <TabsTrigger value="preview" disabled={!preview}>
              3. Preview
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!importResult}>
              4. Results
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto min-h-0">
            {/* Upload Tab */}
            <TabsContent value="upload" className="p-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Upload Canvas CSV
                  </CardTitle>
                  <CardDescription>
                    Export your gradebook from Canvas and upload it here
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="max-w-xs mx-auto"
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      Select your Canvas gradebook CSV export
                    </p>
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>How to Export from Canvas</AlertTitle>
                    <AlertDescription className="mt-2 space-y-1 text-sm">
                      <p>1. Go to your Canvas course Gradebook</p>
                      <p>2. Click <strong>Export</strong> → <strong>Export Entire Gradebook</strong></p>
                      <p>3. Upload the downloaded CSV file here</p>
                    </AlertDescription>
                  </Alert>

                  {normalizedData && (
                    <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-700 dark:text-green-400">CSV Loaded</AlertTitle>
                      <AlertDescription className="text-green-600 dark:text-green-300">
                        Found {normalizedData.students.length} students and {normalizedData.assignments.length} assignments
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Mapping Tab */}
            <TabsContent value="mapping" className="p-1">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Map Assignments</CardTitle>
                      <CardDescription>
                        Connect Canvas columns to portal assignments ({mappedCount} of {mappings.length} mapped)
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={autoMatchAll}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Auto-Match All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                      {mappings.map((mapping, index) => (
                        <div key={mapping.canvasColumn} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="font-medium truncate flex-1 mr-2" title={mapping.canvasColumn}>
                              {mapping.canvasColumn}
                            </div>
                            {(mapping.portalAssignment || mapping.mappingTarget === 'absences') && (
                              <Badge variant="secondary" className="flex-shrink-0">
                                {mapping.mappingTarget === 'absences' ? 'Absences' : 'Mapped'}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Portal Assignment</label>
                              <Select
                                value={mapping.mappingTarget === 'absences' ? '__absences__' : (mapping.portalAssignment?.id.toString() || "__skip__")}
                                onValueChange={(value) => {
                                  if (value === "__skip__") {
                                    setMappings(prev => prev.map((m, i) =>
                                      i === index ? { ...m, portalAssignment: null, mappingTarget: undefined } : m
                                    ));
                                    return;
                                  }
                                  if (value === "__absences__") {
                                    setMappings(prev => prev.map((m, i) =>
                                      i === index ? { ...m, portalAssignment: null, mappingTarget: 'absences' as const } : m
                                    ));
                                    return;
                                  }
                                  const assignment = portalAssignments?.find(a => a.id === parseInt(value));
                                  setMappings(prev => prev.map((m, i) =>
                                    i === index ? { ...m, portalAssignment: assignment || null, mappingTarget: 'assignment' as const } : m
                                  ));
                                }}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue placeholder="Select assignment..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__skip__">-- Skip this column --</SelectItem>
                                  <SelectItem value="__absences__">Absences (count)</SelectItem>
                                  {portalAssignments?.map(a => (
                                    <SelectItem key={a.id} value={a.id.toString()}>
                                      {a.name} ({a.scoringType})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {mapping.mappingTarget !== 'absences' && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Canvas Grade Type</label>
                              <Select
                                value={mapping.gradingType}
                                onValueChange={(value) => updateMapping(index, 'gradingType', value)}
                              >
                                <SelectTrigger className="mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="points">Points (0-100)</SelectItem>
                                  <SelectItem value="percentage">Percentage</SelectItem>
                                  <SelectItem value="letter">Letter Grade</SelectItem>
                                  <SelectItem value="status">Status Text</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="mt-4 pt-4 border-t">
                    <Button
                      onClick={() => previewMutation.mutate()}
                      disabled={!canPreview || previewMutation.isPending}
                      className="w-full"
                    >
                      {previewMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Generating Preview...
                        </>
                      ) : (
                        <>
                          Preview Import
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preview Tab */}
            <TabsContent value="preview" className="p-1">
              {preview && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className={`grid grid-cols-2 ${preview.summary.totalAbsenceUpdates > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
                    <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                      <CardContent className="p-4 text-center">
                        <Users className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                          {preview.summary.totalStudents}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-300">Total Students</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                          {preview.summary.matchedStudents}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-300">Matched</div>
                      </CardContent>
                    </Card>

                    <Card className={`${preview.summary.unmatchedStudents > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-950/20'}`}>
                      <CardContent className="p-4 text-center">
                        <UserX className={`h-6 w-6 mx-auto mb-1 ${preview.summary.unmatchedStudents > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                        <div className={`text-2xl font-bold ${preview.summary.unmatchedStudents > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500'}`}>
                          {preview.summary.unmatchedStudents}
                        </div>
                        <div className={`text-xs ${preview.summary.unmatchedStudents > 0 ? 'text-red-600 dark:text-red-300' : 'text-gray-500'}`}>Not Found</div>
                      </CardContent>
                    </Card>

                    <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                      <CardContent className="p-4 text-center">
                        <FileSpreadsheet className="h-6 w-6 text-purple-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                          {preview.summary.totalGradeUpdates}
                        </div>
                        <div className="text-xs text-purple-600 dark:text-purple-300">Grade Updates</div>
                      </CardContent>
                    </Card>

                    {preview.summary.totalAbsenceUpdates > 0 && (
                      <Card className="bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800">
                        <CardContent className="p-4 text-center">
                          <AlertTriangle className="h-6 w-6 text-orange-600 mx-auto mb-1" />
                          <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                            {preview.summary.totalAbsenceUpdates}
                          </div>
                          <div className="text-xs text-orange-600 dark:text-orange-300">Absence Updates</div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Unmatched Students Warning */}
                  {preview.unmatchedStudents.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Unmatched Students</AlertTitle>
                      <AlertDescription>
                        <p className="mb-2">The following students could not be matched and will be skipped:</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {preview.unmatchedStudents.slice(0, 5).map((student, i) => (
                            <li key={i}>
                              {student.displayName}
                              {student.email && <span className="text-muted-foreground"> ({student.email})</span>}
                            </li>
                          ))}
                          {preview.unmatchedStudents.length > 5 && (
                            <li className="text-muted-foreground">
                              ...and {preview.unmatchedStudents.length - 5} more
                            </li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Grade Changes Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Grade Changes Preview</CardTitle>
                      <CardDescription>
                        {preview.gradeChanges.length} grades will be updated
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[250px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Student</TableHead>
                              <TableHead>Assignment</TableHead>
                              <TableHead className="text-right">Current</TableHead>
                              <TableHead className="text-center w-10"></TableHead>
                              <TableHead>New</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.gradeChanges.slice(0, 20).map((change, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{change.studentName}</TableCell>
                                <TableCell>{change.assignmentName}</TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {change.currentValue || '—'}
                                </TableCell>
                                <TableCell className="text-center">
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </TableCell>
                                <TableCell className="font-medium text-green-600 dark:text-green-400">
                                  {change.newValue}
                                  {change.convertedStatus !== null && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({STATUS_LABELS[change.convertedStatus]})
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {preview.gradeChanges.length > 20 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            ...and {preview.gradeChanges.length - 20} more changes
                          </p>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Absence Changes */}
                  {preview.absenceChanges.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Absence Changes Preview</CardTitle>
                        <CardDescription>
                          {preview.absenceChanges.length} student absence records will be updated
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead className="text-right">Current</TableHead>
                                <TableHead className="text-center w-10"></TableHead>
                                <TableHead>New</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {preview.absenceChanges.map((change, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{change.studentName}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {change.currentAbsences}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  </TableCell>
                                  <TableCell className="font-medium text-green-600 dark:text-green-400">
                                    {change.newAbsences}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Import Button */}
                  <Button
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending || (preview.gradeChanges.length === 0 && preview.absenceChanges.length === 0)}
                    className="w-full"
                    size="lg"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import {preview.gradeChanges.length + preview.absenceChanges.length} Updates
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="p-1">
              {importResult && (
                <div className="space-y-4">
                  <Alert className={importResult.success ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"}>
                    {importResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    <AlertTitle className={importResult.success ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"}>
                      {importResult.success ? "Import Complete" : "Import Completed with Issues"}
                    </AlertTitle>
                    <AlertDescription className={importResult.success ? "text-green-600 dark:text-green-300" : "text-yellow-600 dark:text-yellow-300"}>
                      Updated {importResult.processedGrades} grades{importResult.processedAbsences > 0 ? ` and ${importResult.processedAbsences} absence records` : ''} for {importResult.processedStudents} students
                    </AlertDescription>
                  </Alert>

                  {importResult.errors.length > 0 && (
                    <Card className="border-red-200 dark:border-red-800">
                      <CardHeader>
                        <CardTitle className="text-lg text-red-700 dark:text-red-400">
                          Errors ({importResult.errors.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[200px]">
                          <ul className="space-y-2">
                            {importResult.errors.map((err, i) => (
                              <li key={i} className="text-sm text-red-600 dark:text-red-400">
                                <strong>{err.student}</strong> - {err.assignment}: {err.error}
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  <Button
                    onClick={() => {
                      resetState();
                      setOpen(false);
                    }}
                    className="w-full"
                  >
                    Close
                  </Button>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
