import { QueryClientProvider } from "@tanstack/react-query";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "./hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import InstructorDashboard from "@/pages/instructor-dashboard";
import StudentDashboard from "@/pages/student-dashboard";
import StudentClassView from "@/pages/student-class-view";
import StudentEngagement from "@/pages/student-engagement";
import ClassManagement from "@/pages/class-management";
import ClassAnalytics from "@/pages/class-analytics";
import InstructorEngagementDashboard from "@/pages/instructor-engagement-dashboard";
import SetupAccountPage from "@/pages/setup-account";
import ResetPasswordPage from "@/pages/reset-password";
import { ProtectedRoute } from "./lib/protected-route";
import { Navbar } from "@/components/layout/navbar"; // Import Navbar component

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/setup-account" component={SetupAccountPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <ProtectedRoute path="/instructor" component={InstructorDashboard} />
      <Route path="/instructor/class/:classId" component={() => <ProtectedRoute path="/instructor/class/:classId" component={ClassManagement} />} />
      <Route path="/instructor/class/:classId/analytics" component={() => <ProtectedRoute path="/instructor/class/:classId/analytics" component={ClassAnalytics} />} />
      <Route path="/instructor/class/:classId/engagement" component={() => <ProtectedRoute path="/instructor/class/:classId/engagement" component={InstructorEngagementDashboard} />} />
      <ProtectedRoute path="/student" component={StudentDashboard} />
      <Route path="/student/class/:classId" component={() => <ProtectedRoute path="/student/class/:classId" component={StudentClassView} />} />
      <Route path="/student/class/:classId/engagement" component={() => <ProtectedRoute path="/student/class/:classId/engagement" component={StudentEngagement} />} />
      <Route path="/" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Navbar /> {/* Added Navbar component */}
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;