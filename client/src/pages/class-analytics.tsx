import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Class, Assignment, User, AssignmentProgress, StudentContract, GradeContract } from "@shared/schema";
import { AssignmentStatus, getAssignmentStatusLabel } from "@shared/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Clock } from "lucide-react";

interface ClassAnalytics {
  classInfo: Class;
  totalStudents: number;
  overallCompletionRate: number;
  atRiskStudents: number;
  highPerformers: number;
  assignmentStats: {
    assignment: Assignment;
    completionRate: number;
    statusBreakdown: {
      notStarted: number;
      inProgress: number;
      completed: number;
      excellent: number;
    };
  }[];
  studentPerformance: {
    student: User;
    contract: StudentContract | null;
    progressScore: number;
    completedAssignments: number;
    totalAssignments: number;
    lastActivity: string;
  }[];
  contractDistribution: {
    gradeLevel: string;
    count: number;
    percentage: number;
    confirmed: number;
    pending: number;
  }[];
}

export default function ClassAnalytics() {
  const { user } = useAuth();
  const params = useParams<{ classId: string }>();
  const [, setLocation] = useLocation();
  const parsedClassId = parseInt(params.classId);

  const { data: analyticsData, isLoading } = useQuery<ClassAnalytics>({
    queryKey: [`/api/classes/${parsedClassId}/analytics`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0072BC] mx-auto mb-4"></div>
          <p className="text-lg text-slate-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg text-slate-600">Unable to load analytics data</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: number): string => {
    switch (status) {
      case AssignmentStatus.NOT_STARTED: return "bg-slate-200 text-slate-700";
      case AssignmentStatus.IN_PROGRESS: return "bg-yellow-200 text-yellow-800";
      case AssignmentStatus.COMPLETED: return "bg-blue-200 text-blue-800";
      case AssignmentStatus.EXCELLENT: return "bg-green-200 text-green-800";
      default: return "bg-slate-200 text-slate-700";
    }
  };

  // Use shared constant for status labels
  const getStatusLabel = getAssignmentStatusLabel;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-[#0072BC] text-white p-6" role="banner">
        <div className="container mx-auto">
          <nav className="flex items-center space-x-4 mb-6" aria-label="Breadcrumb">
            <Link href={`/instructor/class/${parsedClassId}`}>
              <Button
                variant="ghost"
                size="lg"
                className="text-white hover:text-white/80 text-base"
                aria-label="Return to class management"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Class Management
              </Button>
            </Link>
          </nav>
          <div>
            <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
            <p className="text-lg opacity-90">{analyticsData.classInfo.name}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6" role="main">
        {/* Key Performance Indicators */}
        <section className="mb-8" aria-labelledby="kpi-heading">
          <h2 id="kpi-heading" className="sr-only">Key Performance Indicators</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsData.totalStudents}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Completion</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analyticsData.overallCompletionRate}%</div>
                <Progress value={analyticsData.overallCompletionRate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">At-Risk Students</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{analyticsData.atRiskStudents}</div>
                <p className="text-xs text-muted-foreground">Below 60% completion</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Performers</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{analyticsData.highPerformers}</div>
                <p className="text-xs text-muted-foreground">Above 90% completion</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="assignments" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="assignments">Assignment Progress</TabsTrigger>
            <TabsTrigger value="students">Student Performance</TabsTrigger>
            <TabsTrigger value="contracts">Grade Contracts</TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="space-y-6">
            <div className="grid gap-6">
              {analyticsData.assignmentStats && analyticsData.assignmentStats.length > 0 ? analyticsData.assignmentStats.map((stat) => (
                <Card key={stat.assignment.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">{stat.assignment.name}</CardTitle>
                        <CardDescription>{stat.assignment.moduleGroup}</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-lg px-3 py-1">
                        {stat.completionRate}% Complete
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Progress value={stat.completionRate} className="h-3" />
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-slate-100 rounded-lg">
                          <div className="text-2xl font-bold text-slate-700">{stat.statusBreakdown.notStarted}</div>
                          <div className="text-sm text-muted-foreground">Not Started</div>
                        </div>
                        <div className="text-center p-3 bg-yellow-100 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-700">{stat.statusBreakdown.inProgress}</div>
                          <div className="text-sm text-muted-foreground">In Progress</div>
                        </div>
                        <div className="text-center p-3 bg-blue-100 rounded-lg">
                          <div className="text-2xl font-bold text-blue-700">{stat.statusBreakdown.completed}</div>
                          <div className="text-sm text-muted-foreground">Completed</div>
                        </div>
                        <div className="text-center p-3 bg-green-100 rounded-lg">
                          <div className="text-2xl font-bold text-green-700">{stat.statusBreakdown.excellent}</div>
                          <div className="text-sm text-muted-foreground">Excellent</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Assignment Data</CardTitle>
                    <CardDescription>No assignment statistics available for this class.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="students" className="space-y-6">
            <div className="grid gap-4">
              {analyticsData.studentPerformance && analyticsData.studentPerformance.length > 0 ? analyticsData.studentPerformance.map((performance) => (
                <Card key={performance.student.id}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{performance.student.username}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {performance.contract ? (
                            <Badge variant="outline" className={performance.contract.isConfirmed ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}>
                              Contract {performance.contract.isConfirmed ? "(Confirmed)" : "(Pending)"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-700">No Contract Selected</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{performance.progressScore}%</div>
                        <div className="text-sm text-muted-foreground">
                          {performance.completedAssignments}/{performance.totalAssignments} completed
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Progress value={performance.progressScore} className="h-2" />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Last activity: {performance.lastActivity}</span>
                        {performance.progressScore < 60 && (
                          <Badge variant="destructive" className="text-xs">At Risk</Badge>
                        )}
                        {performance.progressScore >= 90 && (
                          <Badge variant="default" className="text-xs bg-green-600">High Performer</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Student Data</CardTitle>
                    <CardDescription>No student performance data available for this class.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <div className="grid gap-6">
              {analyticsData.contractDistribution && analyticsData.contractDistribution.length > 0 ? analyticsData.contractDistribution.map((distribution) => (
                <Card key={distribution.gradeLevel}>
                  <CardHeader>
                    <CardTitle className="text-xl">Grade {distribution.gradeLevel} Contract</CardTitle>
                    <CardDescription>
                      {distribution.count} students ({distribution.percentage}% of class)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Progress value={distribution.percentage} className="h-3" />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-green-100 rounded-lg">
                          <div className="text-2xl font-bold text-green-700">{distribution.confirmed}</div>
                          <div className="text-sm text-muted-foreground">Confirmed</div>
                        </div>
                        <div className="text-center p-4 bg-yellow-100 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-700">{distribution.pending}</div>
                          <div className="text-sm text-muted-foreground">Pending</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <Card>
                  <CardHeader>
                    <CardTitle>No Contract Data</CardTitle>
                    <CardDescription>No contract distribution data available for this class.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}