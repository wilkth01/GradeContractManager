import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";

type Props = { classId: number };

interface ComposedMessage {
  studentId: number;
  studentName: string;
  subject: string;
  body: string;
}

interface PreviewResponse {
  messages: ComposedMessage[];
  unlinked: { studentId: number; fullName: string }[];
}

interface CanvasConnection {
  connected: boolean;
  canvasUser?: { id: number; name: string };
  error?: string;
}

interface SendResult {
  sent: string[];
  failed: { studentName: string; error: string }[];
}

export function SendContractUpdatesDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState("");
  const [signature, setSignature] = useState("");
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connection } = useQuery<CanvasConnection>({
    queryKey: ["/api/canvas/connection"],
    enabled: open,
  });

  const preview = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/messages/preview`, {
        intro,
        signature,
      });
      return (await res.json()) as PreviewResponse;
    },
  });

  const send = useMutation({
    mutationFn: async (studentIds: number[]) => {
      const res = await apiRequest("POST", `/api/classes/${classId}/messages/send`, {
        studentIds,
        intro,
        signature,
      });
      return (await res.json()) as SendResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/activity`] });
      toast({
        title: data.failed.length ? "Sent with errors" : "Messages sent",
        description: `${data.sent.length} delivered, ${data.failed.length} failed.`,
        variant: data.failed.length ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
    },
  });

  const unlinkedIds = new Set((preview.data?.unlinked ?? []).map((u) => u.studentId));
  const sendable = (preview.data?.messages ?? []).filter((m) => !unlinkedIds.has(m.studentId));
  const chosen = selected ?? new Set(sendable.map((m) => m.studentId));

  const toggle = (studentId: number) => {
    const next = new Set(chosen);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setSelected(next);
  };

  const reset = () => {
    setResult(null);
    setSelected(null);
    setExpanded(null);
    preview.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail className="h-4 w-4 mr-2" />
          Send Contract Updates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Send Grade Contract Updates</DialogTitle>
          <DialogDescription>
            Each student gets their own standing and what they still need for each contract
            level. Messages go to the Canvas Inbox, so students get them through their normal
            Canvas notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {connection && !connection.connected && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Canvas not connected</AlertTitle>
              <AlertDescription>
                {connection.error ??
                  "Add a Canvas access token in Canvas settings before sending."}
              </AlertDescription>
            </Alert>
          )}

          {result ? (
            <div className="space-y-4">
              <Alert variant={result.failed.length ? "destructive" : undefined}>
                {result.failed.length ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <AlertTitle>
                  {result.sent.length} sent, {result.failed.length} failed
                </AlertTitle>
              </Alert>

              {result.failed.length > 0 && (
                <div className="space-y-1 text-sm">
                  {result.failed.map((failure, i) => (
                    <p key={i}>
                      <span className="font-medium">{failure.studentName}</span> —{" "}
                      <span className="text-muted-foreground">{failure.error}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="msg-intro" className="text-sm font-medium block mb-1">
                    Opening paragraph (optional)
                  </label>
                  <Textarea
                    id="msg-intro"
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                    placeholder="e.g. We're in the last week of the term. All remaining work is due Friday."
                    className="min-h-[80px]"
                  />
                </div>
                <div>
                  <label htmlFor="msg-signature" className="text-sm font-medium block mb-1">
                    Sign-off (optional)
                  </label>
                  <Textarea
                    id="msg-signature"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={"e.g. Best,\nProf. Wilk"}
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setSelected(null);
                  preview.mutate();
                }}
                disabled={preview.isPending}
              >
                {preview.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {preview.data ? "Refresh preview" : "Preview messages"}
              </Button>

              {preview.data && (
                <>
                  {preview.data.unlinked.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {preview.data.unlinked.length} student
                        {preview.data.unlinked.length === 1 ? "" : "s"} cannot be messaged
                      </AlertTitle>
                      <AlertDescription>
                        No Canvas account is linked for{" "}
                        {preview.data.unlinked.map((u) => u.fullName).join(", ")}. Sync the
                        roster from Canvas to link them.
                      </AlertDescription>
                    </Alert>
                  )}

                  <ScrollArea className="max-h-[35vh] border rounded-md">
                    <div className="divide-y">
                      {sendable.map((message) => (
                        <div key={message.studentId} className="p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`msg-${message.studentId}`}
                              checked={chosen.has(message.studentId)}
                              onCheckedChange={() => toggle(message.studentId)}
                              aria-label={`Send to ${message.studentName}`}
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`msg-${message.studentId}`}
                                className="font-medium cursor-pointer"
                              >
                                {message.studentName}
                              </label>
                              <button
                                type="button"
                                className="block text-sm text-muted-foreground hover:text-foreground text-left"
                                onClick={() =>
                                  setExpanded(
                                    expanded === message.studentId ? null : message.studentId
                                  )
                                }
                              >
                                {expanded === message.studentId ? "Hide" : "Show"} message
                              </button>
                              {expanded === message.studentId && (
                                <pre className="mt-2 text-xs whitespace-pre-wrap bg-muted p-3 rounded font-sans">
                                  {message.body}
                                </pre>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {result
              ? "Messages already sent."
              : preview.data
                ? `${chosen.size} of ${sendable.length} selected`
                : "Preview first to see what each student will receive."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            {!result && (
              <Button
                onClick={() => send.mutate(Array.from(chosen))}
                disabled={
                  send.isPending ||
                  !preview.data ||
                  chosen.size === 0 ||
                  !connection?.connected
                }
              >
                {send.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send to {chosen.size} student{chosen.size === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
