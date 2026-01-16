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
import { Loader2, Notebook, BookOpen, Target, ArrowRight, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export default function StudentDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: classes, isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const handleViewClass = (classId: number) => {
    setLocation(`/student/class/${classId}`);
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
                Student Portal
              </p>
              <h1 className="text-3xl md:text-4xl font-bold mb-2 text-shadow">
                Welcome back, {user?.fullName?.split(" ")[0]}
              </h1>
              <p className="text-white/90 text-lg">
                View your classes and track your progress toward your grade goals
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
                  <p className="text-2xl font-bold">{classes?.length || 0}</p>
                  <p className="text-white/80 text-sm">Enrolled Classes</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">--</p>
                  <p className="text-white/80 text-sm">Contracts Set</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="container mx-auto px-4 py-8" role="main">
        <div className="grid gap-8">
          <section aria-labelledby="classes-heading" className="animate-slide-up">
            <div className="mb-6">
              <h2 id="classes-heading" className="text-2xl md:text-3xl font-bold text-foreground">
                Your Classes
              </h2>
              <p className="text-muted-foreground mt-1">
                Select a class to view your contract and track progress
              </p>
            </div>

            {classes?.length === 0 ? (
              <Card className="border-2 border-dashed border-muted-foreground/25">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6">
                    <Notebook className="h-10 w-10 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3">No Classes Yet</h3>
                  <p className="text-muted-foreground max-w-md text-base leading-relaxed">
                    You are not enrolled in any classes at the moment. Your instructor will send you
                    an invitation to join their class.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
                {classes?.map((cls, index) => (
                  <Card
                    key={cls.id}
                    className="group cursor-pointer flex flex-col border-2 hover:border-primary/50 transition-all duration-300"
                    role="listitem"
                    onClick={() => handleViewClass(cls.id)}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors">
                        {cls.name}
                      </CardTitle>
                      {cls.description && (
                        <CardDescription className="mt-2">
                          <div className="line-clamp-3 text-sm leading-relaxed">
                            <RichTextEditor
                              value={cls.description}
                              editable={false}
                            />
                          </div>
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="mt-auto pt-0">
                      <Button
                        className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                        variant="outline"
                        size="lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewClass(cls.id);
                        }}
                        aria-label={`View details for ${cls.name}`}
                      >
                        View Class
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
