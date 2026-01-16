import { useAuth } from "@/hooks/use-auth";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Class, EngagementIntention, InsertEngagementIntention } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Plus, CheckCircle2, XCircle, Calendar, Archive, Target } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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

interface WeekIntentionCardProps {
  weekNumber: number;
  intention?: EngagementIntention;
  isCurrentWeek: boolean;
  onUpdate: () => void;
  semesterStartDate?: string;
}

function WeekIntentionCard({ weekNumber, intention, isCurrentWeek, onUpdate, semesterStartDate }: WeekIntentionCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [intentionText, setIntentionText] = useState(intention?.intentionText || "");
  const [isFulfilled, setIsFulfilled] = useState(intention?.isFulfilled || false);
  const [notes, setNotes] = useState(intention?.notes || "");
  const { toast } = useToast();
  const { user } = useAuth();
  const params = useParams<{ classId: string }>();
  const parsedClassId = parseInt(params.classId);

  const createMutation = useMutation({
    mutationFn: async (data: Omit<InsertEngagementIntention, "studentId" | "classId">) => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${parsedClassId}/engagement-intentions`,
        {
          ...data,
          studentId: user?.id,
          classId: parsedClassId,
        }
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Engagement intention created successfully",
      });
      setIsDialogOpen(false);
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: { intentionText?: string; isFulfilled?: boolean; notes?: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/engagement-intentions/${intention?.id}`,
        updates
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Engagement intention updated successfully",
      });
      setIsDialogOpen(false);
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!intentionText.trim()) {
      toast({
        title: "Error",
        description: "Please enter your engagement intention",
        variant: "destructive",
      });
      return;
    }

    if (intention) {
      updateMutation.mutate({
        intentionText: intentionText.trim(),
        isFulfilled,
        notes: notes.trim() || undefined,
      });
    } else {
      createMutation.mutate({
        weekNumber,
        intentionText: intentionText.trim(),
        isFulfilled,
        notes: notes.trim() || undefined,
      });
    }
  };

  const handleOpenDialog = () => {
    setIntentionText(intention?.intentionText || "");
    setIsFulfilled(intention?.isFulfilled || false);
    setNotes(intention?.notes || "");
    setIsDialogOpen(true);
  };

  return (
    <Card className={`border-2 hover:shadow-lg transition-shadow ${
      isCurrentWeek ? "border-[#0072BC] bg-blue-50/30" : ""
    }`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Week {weekNumber}
            {isCurrentWeek && (
              <span className="px-2 py-1 text-xs font-medium bg-[#0072BC] text-white rounded-full">
                Current
              </span>
            )}
          </CardTitle>
          {intention && (
            <div className="flex items-center gap-2">
              {intention.isFulfilled ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {intention ? (
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">Intention:</h4>
              <p className="text-base">{intention.intentionText}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Fulfilled:</span>
              <span className={`px-2 py-1 text-sm font-medium rounded-full ${
                intention.isFulfilled 
                  ? "bg-green-100 text-green-800" 
                  : "bg-red-100 text-red-800"
              }`}>
                {intention.isFulfilled ? "Yes" : "No"}
              </span>
            </div>

            {intention.notes && (
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground mb-1">Notes:</h4>
                <p className="text-base text-muted-foreground">{intention.notes}</p>
              </div>
            )}

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleOpenDialog}
                  disabled={!isCurrentWeek && weekNumber > getCurrentWeekNumber(semesterStartDate)}
                >
                  Edit Intention
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Week {weekNumber} Engagement Intention</DialogTitle>
                  <DialogDescription>
                    Update your engagement intention and reflection for this week.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="intention" className="text-sm font-medium">
                      Engagement Intention
                    </label>
                    <Textarea
                      id="intention"
                      placeholder="What is your intention for engaging with this class this week?"
                      value={intentionText}
                      onChange={(e) => setIntentionText(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fulfilled"
                      checked={isFulfilled}
                      onCheckedChange={(checked) => setIsFulfilled(checked === true)}
                    />
                    <label htmlFor="fulfilled" className="text-sm font-medium">
                      I fulfilled my engagement intention this week
                    </label>
                  </div>

                  <div>
                    <label htmlFor="notes" className="text-sm font-medium">
                      Reflection Notes (Optional)
                    </label>
                    <Textarea
                      id="notes"
                      placeholder="Reflect on your engagement experience this week..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="text-center py-8">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              No engagement intention set for this week
            </p>
            {(isCurrentWeek || weekNumber <= getCurrentWeekNumber(semesterStartDate)) && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleOpenDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Set Intention
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Set Week {weekNumber} Engagement Intention</DialogTitle>
                    <DialogDescription>
                      Define your engagement intention and track your progress for this week.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="intention" className="text-sm font-medium">
                        Engagement Intention
                      </label>
                      <Textarea
                        id="intention"
                        placeholder="What is your intention for engaging with this class this week?"
                        value={intentionText}
                        onChange={(e) => setIntentionText(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="fulfilled"
                        checked={isFulfilled}
                        onCheckedChange={(checked) => setIsFulfilled(checked === true)}
                      />
                      <label htmlFor="fulfilled" className="text-sm font-medium">
                        I fulfilled my engagement intention this week
                      </label>
                    </div>

                    <div>
                      <label htmlFor="notes" className="text-sm font-medium">
                        Reflection Notes (Optional)
                      </label>
                      <Textarea
                        id="notes"
                        placeholder="Reflect on your engagement experience this week..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSave}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Intention
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StudentEngagement() {
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

  // Fetch student's engagement intentions
  const { data: intentions, isLoading: isLoadingIntentions } = useQuery<EngagementIntention[]>({
    queryKey: [`/api/classes/${parsedClassId}/engagement-intentions`],
    enabled: !isNaN(parsedClassId) && !!user,
  });

  const currentWeek = getCurrentWeekNumber(classData?.semesterStartDate);

  const handleUpdate = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/classes/${parsedClassId}/engagement-intentions`],
    });
  };

  const isLoading = isLoadingClass || isLoadingIntentions;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!classData) {
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

  // Create a map of intentions by week number
  const intentionsByWeek = (intentions || []).reduce((acc, intention) => {
    acc[intention.weekNumber] = intention;
    return acc;
  }, {} as Record<number, EngagementIntention>);

  // Generate all 15 weeks
  const weeks = Array.from({ length: 15 }, (_, i) => i + 1);

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
              onClick={() => setLocation(`/student/class/${parsedClassId}`)}
              aria-label="Return to class view"
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Back to Class
            </Button>
          </nav>
          <div>
            <h1 className="text-4xl font-bold mb-2">Engagement Tracking</h1>
            <p className="text-lg opacity-90">{classData.name} - Weekly Intentions</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto py-8" role="main">
        <div className="space-y-8">
          {/* Current Week Highlight */}
          <section aria-labelledby="current-week-heading">
            <Card className="border-[#0072BC] border-2 bg-blue-50/50">
              <CardHeader>
                <CardTitle id="current-week-heading" className="text-2xl font-bold flex items-center gap-2">
                  <Target className="h-6 w-6 text-[#0072BC]" />
                  Current Week Focus (Week {currentWeek})
                </CardTitle>
                <CardDescription className="text-base">
                  Set your engagement intention for this week and track your progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WeekIntentionCard
                  weekNumber={currentWeek}
                  intention={intentionsByWeek[currentWeek]}
                  isCurrentWeek={true}
                  onUpdate={handleUpdate}
                  semesterStartDate={classData?.semesterStartDate}
                />
              </CardContent>
            </Card>
          </section>

          {/* All Weeks Grid */}
          <section aria-labelledby="all-weeks-heading">
            <div className="flex items-center justify-between mb-6">
              <h2 id="all-weeks-heading" className="text-3xl font-bold">15-Week Semester Overview</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>Fulfilled</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>Not Fulfilled</span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {weeks.map((weekNumber) => (
                <WeekIntentionCard
                  key={weekNumber}
                  weekNumber={weekNumber}
                  intention={intentionsByWeek[weekNumber]}
                  isCurrentWeek={weekNumber === currentWeek}
                  onUpdate={handleUpdate}
                  semesterStartDate={classData?.semesterStartDate}
                />
              ))}
            </div>
          </section>

          {/* Summary Stats */}
          {intentions && intentions.length > 0 && (
            <section aria-labelledby="summary-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="summary-heading" className="text-2xl font-bold flex items-center gap-2">
                    <Archive className="h-6 w-6" />
                    Engagement Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-green-200 bg-green-50/50">
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold text-green-600">
                          {intentions.filter(i => i.isFulfilled).length}
                        </div>
                        <div className="text-sm text-green-700">Intentions Fulfilled</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="border-blue-200 bg-blue-50/50">
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold text-blue-600">
                          {intentions.length}
                        </div>
                        <div className="text-sm text-blue-700">Total Intentions Set</div>
                      </CardContent>
                    </Card>
                    
                    <Card className="border-[#0072BC] bg-blue-50/50">
                      <CardContent className="p-4 text-center">
                        <div className="text-3xl font-bold text-[#0072BC]">
                          {intentions.length > 0 ? Math.round((intentions.filter(i => i.isFulfilled).length / intentions.length) * 100) : 0}%
                        </div>
                        <div className="text-sm text-[#0072BC]">Fulfillment Rate</div>
                      </CardContent>
                    </Card>
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