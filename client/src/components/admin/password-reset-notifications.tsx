import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, User, Clock, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PasswordResetRequest {
  id: number;
  userId: number;
  token: string;
  isUsed: boolean;
  expiresAt: string;
  createdAt: string;
  adminNotified: boolean;
  user: {
    id: number;
    username: string;
    fullName: string;
    email: string;
  } | null;
}

export function PasswordResetNotifications() {
  const { toast } = useToast();

  const { data: resetRequests = [], isLoading, error } = useQuery<PasswordResetRequest[]>({
    queryKey: ["/api/admin/password-reset-requests"],
    refetchInterval: 30000, // Check every 30 seconds for new requests
  });

  const markNotifiedMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const response = await apiRequest("POST", `/api/admin/password-reset-requests/${requestId}/notify`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/password-reset-requests"] });
      toast({
        title: "Marked as Notified",
        description: "Password reset request has been marked as handled.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as notified",
        variant: "destructive",
      });
    },
  });

  const generateResetLink = (token: string) => {
    const resetUrl = `${window.location.origin}/reset-password?token=${token}`;
    navigator.clipboard.writeText(resetUrl);
    toast({
      title: "Reset Link Copied",
      description: "The password reset link has been copied to your clipboard.",
    });
  };

  const generateResetEmail = (request: PasswordResetRequest) => {
    if (!request.user) return;

    const resetUrl = `${window.location.origin}/reset-password?token=${request.token}`;
    const expiryTime = new Date(request.expiresAt).toLocaleDateString();
    
    const emailTemplate = `Subject: Password Reset Link - Contract Grading Portal

Dear ${request.user.fullName},

You have requested a password reset for your Contract Grading Portal account.

Please click the link below to reset your password:
${resetUrl}

This link will expire on ${expiryTime}.

If you did not request this password reset, please ignore this email.

Best regards,
Your Instructor`;

    navigator.clipboard.writeText(emailTemplate);
    toast({
      title: "Email Template Copied",
      description: "The password reset email template has been copied to your clipboard.",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Password Reset Requests
          </CardTitle>
          <CardDescription>
            Students who have requested password resets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading requests...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Password Reset Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load password reset requests. Please refresh the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const pendingRequests = resetRequests.filter(request => !request.adminNotified && !request.isUsed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Password Reset Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingRequests.length} new
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Students who need help resetting their passwords
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendingRequests.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No pending password reset requests
          </p>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="border rounded-lg p-4 bg-yellow-50 border-yellow-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {request.user?.fullName || "Unknown User"}
                      </span>
                      <Badge variant="outline">
                        {request.user?.username}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Clock className="h-3 w-3" />
                      Requested: {new Date(request.createdAt).toLocaleString()}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateResetLink(request.token)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Reset Link
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateResetEmail(request)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Email Template
                      </Button>
                      
                      <Button
                        size="sm"
                        onClick={() => markNotifiedMutation.mutate(request.id)}
                        disabled={markNotifiedMutation.isPending}
                      >
                        Mark as Handled
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}