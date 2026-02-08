import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Class } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CalendarRange,
  Users,
  BookOpen,
  ArrowRight,
  LogOut,
  MoreVertical,
  Archive,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
  FolderArchive,
  Copy
} from "lucide-react";
import { CreateClassDialog } from "@/components/dialogs/create-class-dialog";
import { PasswordResetNotifications } from "@/components/admin/password-reset-notifications";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function InstructorDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<Class | null>(null);
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const archiveMutation = useMutation({
    mutationFn: async (classId: number) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/archive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({
        title: "Class Archived",
        description: "The class has been moved to inactive.",
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

  const unarchiveMutation = useMutation({
    mutationFn: async (classId: number) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/unarchive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({
        title: "Class Activated",
        description: "The class is now active and visible to students.",
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

  const deleteMutation = useMutation({
    mutationFn: async (classId: number) => {
      const res = await apiRequest("DELETE", `/api/classes/${classId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({
        title: "Class Deleted",
        description: "The class and all its data have been permanently deleted.",
      });
      setDeleteDialogOpen(false);
      setClassToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (classId: number) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/clone`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({
        title: "Class Cloned",
        description: "A copy of the class has been created with all assignments and contracts.",
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

  const handleManageClass = (classId: number) => {
    if (classId) {
      setLocation(`/instructor/class/${classId}`);
    }
  };

  const handleArchive = (cls: Class, e: React.MouseEvent) => {
    e.stopPropagation();
    archiveMutation.mutate(cls.id);
  };

  const handleUnarchive = (cls: Class, e: React.MouseEvent) => {
    e.stopPropagation();
    unarchiveMutation.mutate(cls.id);
  };

  const handleDeleteClick = (cls: Class, e: React.MouseEvent) => {
    e.stopPropagation();
    setClassToDelete(cls);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (classToDelete) {
      deleteMutation.mutate(classToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const activeClasses = classes?.filter((c) => !c.isArchived) || [];
  const inactiveClasses = classes?.filter((c) => c.isArchived) || [];

  const ClassCard = ({ cls, isArchived }: { cls: Class; isArchived: boolean }) => (
    <Card
      className={`group cursor-pointer border-2 transition-all duration-300 ${
        isArchived
          ? "opacity-75 hover:opacity-100 border-muted"
          : "hover:border-primary/50"
      }`}
      role="listitem"
      onClick={() => handleManageClass(cls.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className={`text-xl font-bold transition-colors ${
                isArchived ? "" : "group-hover:text-primary"
              }`}>
                {cls.name}
              </CardTitle>
              {isArchived && (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  Inactive
                </span>
              )}
            </div>
            {cls.description && (
              <CardDescription className="mt-2 line-clamp-2">
                {cls.description.replace(/<[^>]*>/g, '').slice(0, 100)}...
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Class options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleManageClass(cls.id); }}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Manage Class
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); cloneMutation.mutate(cls.id); }}
                disabled={cloneMutation.isPending}
              >
                <Copy className="mr-2 h-4 w-4" />
                Clone Class
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isArchived ? (
                <DropdownMenuItem
                  onClick={(e) => handleUnarchive(cls, e)}
                  disabled={unarchiveMutation.isPending}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Make Active
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => handleArchive(cls, e)}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Make Inactive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => handleDeleteClick(cls, e)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Button
          className={`w-full transition-all ${
            isArchived
              ? ""
              : "group-hover:bg-primary group-hover:text-primary-foreground"
          }`}
          variant="outline"
          size="lg"
          onClick={(e) => {
            e.stopPropagation();
            handleManageClass(cls.id);
          }}
          aria-label={`Manage ${cls.name} class`}
        >
          Manage Class
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header with gradient */}
      <header className="page-header text-white" role="banner">
        <div className="relative z-10 container mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="animate-fade-in">
              <p className="text-white/80 text-sm font-medium mb-1 uppercase tracking-wider">
                Instructor Portal
              </p>
              <h1 className="text-3xl md:text-4xl font-bold mb-2 text-shadow">
                Welcome back, {user?.fullName?.split(" ")[0]}
              </h1>
              <p className="text-white/90 text-lg">
                Manage your classes and track student progress
              </p>
            </div>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              aria-label="Sign out of your account"
              className="shadow-lg"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign Out
            </Button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeClasses.length}</p>
                  <p className="text-white/80 text-sm">Active Classes</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FolderArchive className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inactiveClasses.length}</p>
                  <p className="text-white/80 text-sm">Inactive Classes</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">--</p>
                  <p className="text-white/80 text-sm">Total Students</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto px-4 py-8" role="main">
        <div className="grid gap-8">
          {/* Password Reset Notifications */}
          <section aria-labelledby="password-reset-heading" className="animate-slide-up">
            <PasswordResetNotifications />
          </section>

          {/* Active Classes Section */}
          <section aria-labelledby="classes-heading" className="animate-slide-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h2 id="classes-heading" className="text-2xl md:text-3xl font-bold text-foreground">
                  Active Classes
                </h2>
                <p className="text-muted-foreground mt-1">
                  Classes currently visible to students
                </p>
              </div>
              <CreateClassDialog />
            </div>

            {activeClasses.length === 0 ? (
              <Card className="border-2 border-dashed border-muted-foreground/25">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6">
                    <CalendarRange className="h-10 w-10 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3">No Active Classes</h3>
                  <p className="text-muted-foreground max-w-md mb-6 text-base leading-relaxed">
                    Get started by creating your first class. You'll be able to add assignments,
                    set up grade contracts, and invite students.
                  </p>
                  <CreateClassDialog />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
                {activeClasses.map((cls, index) => (
                  <div key={cls.id} style={{ animationDelay: `${index * 100}ms` }}>
                    <ClassCard cls={cls} isArchived={false} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Inactive Classes Section */}
          {inactiveClasses.length > 0 && (
            <section aria-labelledby="inactive-classes-heading" className="animate-slide-up">
              <Collapsible open={inactiveOpen} onOpenChange={setInactiveOpen}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FolderArchive className="h-5 w-5 text-muted-foreground" />
                      <div className="text-left">
                        <h2 id="inactive-classes-heading" className="text-lg font-semibold">
                          Inactive Classes
                        </h2>
                        <p className="text-sm text-muted-foreground font-normal">
                          {inactiveClasses.length} class{inactiveClasses.length !== 1 ? "es" : ""} not visible to students
                        </p>
                      </div>
                    </div>
                    {inactiveOpen ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
                    {inactiveClasses.map((cls) => (
                      <ClassCard key={cls.id} cls={cls} isArchived={true} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </section>
          )}
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{classToDelete?.name}</strong> and all associated data including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All assignments</li>
                <li>All student progress records</li>
                <li>All grade contracts</li>
                <li>All student enrollments</li>
                <li>All attendance records</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
