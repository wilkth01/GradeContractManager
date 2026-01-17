import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForgotPasswordDialog } from "@/components/dialogs/forgot-password-dialog";
import { GraduationCap, BookOpen, Users, Award } from "lucide-react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [_location, setLocation] = useLocation();
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  useEffect(() => {
    if (user) {
      setLocation(user.role === "instructor" ? "/instructor" : "/student");
    }
  }, [user, setLocation]);

  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  });

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      role: "student" as const,
      fullName: "",
    },
  });

  const features = [
    {
      icon: BookOpen,
      title: "Choose Your Path",
      description: "Select your target grade and understand exactly what's needed to achieve it.",
    },
    {
      icon: Users,
      title: "Track Progress",
      description: "Monitor your assignment completion and stay on track throughout the semester.",
    },
    {
      icon: Award,
      title: "Earn Your Grade",
      description: "Meet your contract requirements and earn the grade you committed to.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Left side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <main id="main-content" role="main" className="w-full max-w-md animate-fade-in">
          <Card className="border-0 shadow-xl dark:shadow-2xl dark:shadow-black/20">
            <CardHeader className="text-center pb-2 pt-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 dark:bg-primary/20">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                Contract Grading Portal
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Sign in to access your grading contracts
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8">
              <Tabs defaultValue="login" className="mt-4">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" className="text-sm font-medium">
                    Sign In
                  </TabsTrigger>
                  <TabsTrigger value="register" className="text-sm font-medium">
                    Register
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4 animate-fade-in">
                  <Form {...loginForm}>
                    <form
                      onSubmit={loginForm.handleSubmit((data) =>
                        loginMutation.mutate(data)
                      )}
                      className="space-y-5"
                    >
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Username</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-12 text-base"
                                placeholder="Enter your username"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                {...field}
                                className="h-12 text-base"
                                placeholder="Enter your password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign In"}
                      </Button>

                      {loginMutation.error && (
                        <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                          <p className="text-sm text-destructive font-medium mb-2">
                            {loginMutation.error.message}
                          </p>
                          <Button
                            type="button"
                            variant="link"
                            className="text-sm p-0 h-auto font-medium text-primary"
                            onClick={() => setIsForgotPasswordOpen(true)}
                          >
                            Forgot your password?
                          </Button>
                        </div>
                      )}
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="register" className="space-y-4 animate-fade-in">
                  <Form {...registerForm}>
                    <form
                      onSubmit={registerForm.handleSubmit((data) =>
                        registerMutation.mutate(data)
                      )}
                      className="space-y-5"
                    >
                      <FormField
                        control={registerForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Full Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-12 text-base"
                                placeholder="Enter your full name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Username</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-12 text-base"
                                placeholder="Choose a username"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                {...field}
                                className="h-12 text-base"
                                placeholder="Create a password"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">I am a...</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger className="h-12 text-base">
                                  <SelectValue placeholder="Select your role" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="student">Student</SelectItem>
                                <SelectItem value="instructor">Instructor</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Right side - Hero section */}
      <div className="hidden lg:flex flex-1 page-header items-center justify-center text-white p-12 relative">
        <div className="relative z-10 max-w-lg">
          {/* Logo */}
          <div className="mb-8">
            <img
              src="/images/widener-logo.png"
              alt="Widener University Logo"
              className="h-24 w-auto object-contain drop-shadow-lg"
              style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' }}
            />
          </div>

          {/* Welcome text */}
          <h1 className="text-4xl xl:text-5xl font-bold mb-4 text-shadow-lg leading-tight">
            Welcome to Contract Grading
          </h1>
          <p className="text-xl text-white/90 mb-10 leading-relaxed">
            Take control of your learning journey by choosing your grade and meeting the requirements. No surprises, just clear expectations.
          </p>

          {/* Feature cards */}
          <div className="space-y-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02]"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">{feature.title}</h3>
                  <p className="text-white/80 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog
        open={isForgotPasswordOpen}
        onOpenChange={setIsForgotPasswordOpen}
      />
    </div>
  );
}
