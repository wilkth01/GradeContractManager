import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Class } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarRange, Users, BookOpen, ArrowRight, LogOut } from "lucide-react";
import { CreateClassDialog } from "@/components/dialogs/create-class-dialog";
import { PasswordResetNotifications } from "@/components/admin/password-reset-notifications";
import { useLocation } from "wouter";

export default function InstructorDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const handleManageClass = (classId: number) => {
    if (classId) {
      setLocation(`/instructor/class/${classId}`);
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

          <section aria-labelledby="classes-heading" className="animate-slide-up">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h2 id="classes-heading" className="text-2xl md:text-3xl font-bold text-foreground">
                  Your Classes
                </h2>
                <p className="text-muted-foreground mt-1">
                  Create and manage your contract grading classes
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
                  <h3 className="text-2xl font-semibold mb-3">No Classes Yet</h3>
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
                  <Card
                    key={cls.id}
                    className="group cursor-pointer border-2 hover:border-primary/50 transition-all duration-300"
                    role="listitem"
                    onClick={() => handleManageClass(cls.id)}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                            {cls.name}
                          </CardTitle>
                          {cls.description && (
                            <CardDescription className="mt-2 line-clamp-2">
                              {cls.description.replace(/<[^>]*>/g, '').slice(0, 100)}...
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button
                        className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all"
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
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
