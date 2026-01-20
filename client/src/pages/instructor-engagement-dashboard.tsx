import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Class, EngagementIntention, User } from "@shared/schema";
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
import { Loader2, ArrowLeft, Users, Target, TrendingUp, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

// Get current week number based on semester start
const getCurrentWeekNumber = (semesterStartDate?: string): number => {
  const today = new Date();
  // Default to August 25, 2025 if no semester start date provided
  const semesterStart = semesterStartDate ? new Date(semesterStartDate) : new Date('2025-08-25');
  const diffTime = today.getTime() - semesterStart.getTime();
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, Math.min(15, diffWeeks));
};

interface StudentEngagementData {
  student: User;
  intentions: EngagementIntention[];
  totalIntentions: number;
  fulfilledIntentions: number;
  fulfillmentRate: number;
}

export default function InstructorEngagementDashboard() {
  const { user } = useAuth();
  const params = useParams<{ classId: string }>();
  const [, setLocation] = useLocation();
  const parsedClassId = parseInt(params.classId);
  const [selectedWeek, setSelectedWeek] = useState<string>("all");

  // Fetch class details
  const { data: classData, isLoading: isLoadingClass } = useQuery<Class>({
    queryKey: [`/api/classes/${parsedClassId}`],
    enabled: !isNaN(parsedClassId),
  });

  // Fetch all engagement intentions for the class
  const { data: allIntentions, isLoading: isLoadingIntentions } = useQuery<EngagementIntention[]>({
    queryKey: [`/api/classes/${parsedClassId}/engagement-intentions`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  // Fetch enrolled students
  const { data: enrolledStudents, isLoading: isLoadingStudents } = useQuery<User[]>({
    queryKey: [`/api/classes/${parsedClassId}/enrolled-students`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  const currentWeek = getCurrentWeekNumber(classData?.semesterStartDate ?? undefined);

  const isLoading = isLoadingClass || isLoadingIntentions || isLoadingStudents;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!classData || !enrolledStudents) {
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

  // Process student engagement data
  const studentEngagementData: StudentEngagementData[] = enrolledStudents.map(student => {
    const studentIntentions = (allIntentions || []).filter(intention => intention.studentId === student.id);
    const fulfilledIntentions = studentIntentions.filter(intention => intention.isFulfilled);
    
    return {
      student,
      intentions: studentIntentions,
      totalIntentions: studentIntentions.length,
      fulfilledIntentions: fulfilledIntentions.length,
      fulfillmentRate: studentIntentions.length > 0 ? (fulfilledIntentions.length / studentIntentions.length) * 100 : 0,
    };
  });

  // Filter by selected week if needed
  const filteredIntentions = selectedWeek === "all" 
    ? (allIntentions || [])
    : (allIntentions || []).filter(intention => intention.weekNumber === parseInt(selectedWeek));

  // Calculate overall metrics
  const overallMetrics = {
    totalStudents: enrolledStudents.length,
    studentsWithIntentions: studentEngagementData.filter(s => s.totalIntentions > 0).length,
    totalIntentions: (allIntentions || []).length,
    fulfilledIntentions: (allIntentions || []).filter(i => i.isFulfilled).length,
    averageFulfillmentRate: studentEngagementData.reduce((sum, s) => sum + s.fulfillmentRate, 0) / studentEngagementData.length,
    atRiskStudents: studentEngagementData.filter(s => s.fulfillmentRate < 50 && s.totalIntentions > 2).length,
  };

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
              onClick={() => setLocation(`/instructor/class/${parsedClassId}`)}
              aria-label="Return to class management"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Class Management
            </Button>
          </nav>
          <div>
            <h1 className="text-4xl font-bold mb-2">Engagement Analytics</h1>
            <p className="text-lg opacity-90">{classData.name} - Student Engagement Tracking</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto py-8" role="main">
        <div className="space-y-8">
          {/* Week Filter */}
          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Week Filter
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <label htmlFor="week-select" className="text-sm font-medium">
                    View data for:
                  </label>
                  <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                    <SelectTrigger id="week-select" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Weeks</SelectItem>
                      {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                        <SelectItem key={week} value={week.toString()}>
                          Week {week} {week === currentWeek ? "(Current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Overall Metrics */}
          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className="text-3xl font-bold mb-6">Class Engagement Overview</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700">Total Students</p>
                      <p className="text-3xl font-bold text-blue-600">{overallMetrics.totalStudents}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700">Active Participants</p>
                      <p className="text-3xl font-bold text-green-600">{overallMetrics.studentsWithIntentions}</p>
                    </div>
                    <Target className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#0072BC] bg-blue-50/50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#0072BC]">Avg. Fulfillment Rate</p>
                      <p className="text-3xl font-bold text-[#0072BC]">
                        {Math.round(overallMetrics.averageFulfillmentRate)}%
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-[#0072BC]" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-700">At-Risk Students</p>
                      <p className="text-3xl font-bold text-red-600">{overallMetrics.atRiskStudents}</p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Student Engagement Data */}
          <section aria-labelledby="student-data-heading">
            <h2 id="student-data-heading" className="text-3xl font-bold mb-6">Individual Student Progress</h2>
            <div className="grid gap-6">
              {studentEngagementData
                .sort((a, b) => b.fulfillmentRate - a.fulfillmentRate)
                .map(({ student, intentions, totalIntentions, fulfilledIntentions, fulfillmentRate }) => (
                <Card key={student.id} className="border-2 hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl">{student.fullName}</CardTitle>
                        <CardDescription>@{student.username}</CardDescription>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${
                          fulfillmentRate >= 80 ? "text-green-600" :
                          fulfillmentRate >= 60 ? "text-yellow-600" :
                          "text-red-600"
                        }`}>
                          {Math.round(fulfillmentRate)}%
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Fulfillment Rate
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-blue-500" />
                        <div>
                          <div className="font-semibold">{totalIntentions}</div>
                          <div className="text-sm text-muted-foreground">Total Intentions</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <div>
                          <div className="font-semibold">{fulfilledIntentions}</div>
                          <div className="text-sm text-muted-foreground">Fulfilled</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <div>
                          <div className="font-semibold">{totalIntentions - fulfilledIntentions}</div>
                          <div className="text-sm text-muted-foreground">Not Fulfilled</div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Intentions */}
                    {intentions.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-semibold mb-3">Recent Intentions:</h4>
                        <div className="space-y-2">
                          {intentions
                            .sort((a, b) => b.weekNumber - a.weekNumber)
                            .slice(0, 3)
                            .map(intention => (
                              <div key={intention.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="flex-shrink-0">
                                  {intention.isFulfilled ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">Week {intention.weekNumber}</div>
                                  <div className="text-sm text-muted-foreground truncate">
                                    {intention.intentionText}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {totalIntentions === 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <strong>Note:</strong> This student hasn't set any engagement intentions yet.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Week-by-Week Breakdown */}
          {selectedWeek !== "all" && (
            <section aria-labelledby="week-breakdown-heading">
              <h2 id="week-breakdown-heading" className="text-3xl font-bold mb-6">
                Week {selectedWeek} Detailed Breakdown
              </h2>
              <Card>
                <CardContent className="p-6">
                  <div className="grid gap-6">
                    {filteredIntentions.length > 0 ? (
                      filteredIntentions.map(intention => {
                        const student = enrolledStudents.find(s => s.id === intention.studentId);
                        return student ? (
                          <div key={intention.id} className="border-l-4 border-blue-200 pl-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-semibold">{student.fullName}</h4>
                                <p className="text-sm text-muted-foreground">@{student.username}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {intention.isFulfilled ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-500" />
                                )}
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  intention.isFulfilled 
                                    ? "bg-green-100 text-green-800" 
                                    : "bg-red-100 text-red-800"
                                }`}>
                                  {intention.isFulfilled ? "Fulfilled" : "Not Fulfilled"}
                                </span>
                              </div>
                            </div>
                            <p className="text-base mb-2"><strong>Intention:</strong> {intention.intentionText}</p>
                            {intention.notes && (
                              <p className="text-sm text-muted-foreground">
                                <strong>Notes:</strong> {intention.notes}
                              </p>
                            )}
                          </div>
                        ) : null;
                      })
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">
                          No engagement intentions recorded for Week {selectedWeek}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}