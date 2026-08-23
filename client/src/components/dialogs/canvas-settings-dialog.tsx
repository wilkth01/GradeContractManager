import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Class } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Link2, CheckCircle2, AlertTriangle } from "lucide-react";

type Props = { classId: number };

interface CanvasConnection {
  connected: boolean;
  baseUrl: string;
  canvasUser?: { id: number; name: string };
  error?: string;
}

interface CanvasCourse {
  id: number;
  name: string;
  courseCode?: string;
}

interface ImportResult {
  linked: { fullName: string }[];
  created: { fullName: string; username: string }[];
  skipped: { fullName: string; reason: string }[];
  canvasStudentCount: number;
}

interface SetupLinksResult {
  sent: string[];
  failed: { studentName: string; error: string }[];
  skipped: { studentName: string; reason: string }[];
}

interface SyncResult {
  matched: { fullName: string }[];
  unmatched: { fullName: string }[];
  canvasStudentCount: number;
}

export function CanvasSettingsDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [setupResult, setSetupResult] = useState<SetupLinksResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connection } = useQuery<CanvasConnection>({
    queryKey: ["/api/canvas/connection"],
    enabled: open,
  });

  const { data: classData } = useQuery<Class>({
    queryKey: [`/api/classes/${classId}`],
    enabled: open,
  });

  const { data: courses } = useQuery<CanvasCourse[]>({
    queryKey: ["/api/canvas/courses"],
    enabled: open && !!connection?.connected,
  });

  const saveToken = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/canvas/token", { token });
    },
    onSuccess: () => {
      setToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/canvas/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/canvas/courses"] });
      toast({ title: "Connected", description: "Canvas accepted the token." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not connect", description: error.message, variant: "destructive" });
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/canvas/token");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canvas/connection"] });
      toast({ title: "Disconnected", description: "The stored token was removed." });
    },
  });

  const linkCourse = useMutation({
    mutationFn: async (canvasCourseId: number | null) => {
      await apiRequest("PUT", `/api/classes/${classId}/canvas/link`, { canvasCourseId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      toast({ title: "Linked", description: "This class is linked to a Canvas course." });
    },
    onError: (error: Error) => {
      toast({ title: "Could not link", description: error.message, variant: "destructive" });
    },
  });

  const syncRoster = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/canvas/sync-roster`);
      return (await res.json()) as SyncResult;
    },
    onSuccess: (data) => {
      setSyncResult(data);
      toast({
        title: "Roster synced",
        description: `${data.matched.length} matched, ${data.unmatched.length} unmatched.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const importRoster = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/canvas/import-roster`, {
        createMissing: true,
      });
      return (await res.json()) as ImportResult;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/students`] });
      toast({
        title: "Roster imported",
        description: `${data.created.length} created, ${data.linked.length} already here.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const sendSetupLinks = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/invitations/send-setup-links`
      );
      return (await res.json()) as SetupLinksResult;
    },
    onSuccess: (data) => {
      setSetupResult(data);
      toast({
        title: "Setup links sent",
        description: `${data.sent.length} sent, ${data.failed.length} failed.`,
        variant: data.failed.length ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="h-4 w-4 mr-2" />
          Canvas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Canvas Connection</DialogTitle>
          <DialogDescription>
            Connect your Canvas account to import grades and message students.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-semibold">1. Access token</h3>

            {connection?.connected ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Connected as {connection.canvasUser?.name}</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-4">
                  <span className="text-sm">{connection.baseUrl}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect.mutate()}
                    disabled={disconnect.isPending}
                  >
                    Disconnect
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {connection?.error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{connection.error}</AlertDescription>
                  </Alert>
                )}
                <p className="text-sm text-muted-foreground">
                  In Canvas, go to Account → Settings → Approved Integrations → New Access
                  Token. Paste it here. It is encrypted before being stored and is never sent
                  back to the browser.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your Canvas access token"
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => saveToken.mutate()}
                    disabled={saveToken.isPending || token.trim().length < 20}
                  >
                    {saveToken.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Connect
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">2. Canvas course</h3>
            <p className="text-sm text-muted-foreground">
              Which Canvas course this class corresponds to.
            </p>
            <Select
              value={classData?.canvasCourseId ? String(classData.canvasCourseId) : ""}
              onValueChange={(value) => linkCourse.mutate(value ? parseInt(value) : null)}
              disabled={!connection?.connected || !courses}
            >
              <SelectTrigger>
                <SelectValue placeholder={courses ? "Choose a course" : "Connect Canvas first"} />
              </SelectTrigger>
              <SelectContent>
                {(courses ?? []).map((course) => (
                  <SelectItem key={course.id} value={String(course.id)}>
                    {course.name}
                    {course.courseCode ? ` (${course.courseCode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">3. Roster</h3>
            <p className="text-sm text-muted-foreground">
              Brings the Canvas roster in: students already here are linked to their Canvas
              account, and anyone missing gets an account created from their Canvas details.
              Matching is on Canvas id and username only \u2014 never names, since a wrong match
              would enroll one student under another's record.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => importRoster.mutate()}
                disabled={importRoster.isPending || !classData?.canvasCourseId}
              >
                {importRoster.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import roster from Canvas
              </Button>
              <Button
                variant="outline"
                onClick={() => syncRoster.mutate()}
                disabled={syncRoster.isPending || !classData?.canvasCourseId}
              >
                {syncRoster.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Re-link existing students
              </Button>
            </div>

            {importResult && (
              <Alert variant={importResult.skipped.length ? "destructive" : undefined}>
                {importResult.skipped.length ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <AlertTitle>
                  {importResult.created.length} created, {importResult.linked.length} already
                  here, {importResult.skipped.length} skipped
                </AlertTitle>
                {importResult.skipped.length > 0 && (
                  <AlertDescription>
                    {importResult.skipped
                      .map((s) => `${s.fullName} (${s.reason})`)
                      .join("; ")}
                  </AlertDescription>
                )}
              </Alert>
            )}

            {syncResult && (
              <Alert variant={syncResult.unmatched.length ? "destructive" : undefined}>
                {syncResult.unmatched.length ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <AlertTitle>
                  {syncResult.matched.length} matched, {syncResult.unmatched.length} unmatched
                </AlertTitle>
                {syncResult.unmatched.length > 0 && (
                  <AlertDescription>
                    No Canvas account found for{" "}
                    {syncResult.unmatched.map((s) => s.fullName).join(", ")}.
                  </AlertDescription>
                )}
              </Alert>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">4. Let imported students in</h3>
            <p className="text-sm text-muted-foreground">
              Accounts created from Canvas have no password yet. This sends each of them a
              setup link over Canvas Inbox. Students who can already log in are left alone.
            </p>
            <Button
              variant="outline"
              onClick={() => sendSetupLinks.mutate()}
              disabled={sendSetupLinks.isPending || !connection?.connected}
            >
              {sendSetupLinks.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send setup links
            </Button>

            {setupResult && (
              <Alert
                variant={
                  setupResult.failed.length || setupResult.skipped.length
                    ? "destructive"
                    : undefined
                }
              >
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  {setupResult.sent.length} sent
                  {setupResult.skipped.length > 0 &&
                    `, ${setupResult.skipped.length} skipped`}
                  {setupResult.failed.length > 0 && `, ${setupResult.failed.length} failed`}
                </AlertTitle>
                {(setupResult.skipped.length > 0 || setupResult.failed.length > 0) && (
                  <AlertDescription>
                    {[...setupResult.skipped, ...setupResult.failed]
                      .map((entry: any) =>
                        `${entry.studentName} (${entry.reason ?? entry.error})`
                      )
                      .join("; ")}
                  </AlertDescription>
                )}
              </Alert>
            )}
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}
