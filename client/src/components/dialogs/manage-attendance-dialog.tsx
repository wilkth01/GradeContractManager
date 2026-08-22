import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, ClassSession, SessionParticipation, Class } from "@shared/schema";
import {
  ParticipationLevel,
  getParticipationLabel,
  DEFAULT_PARTICIPATION_BAR,
} from "@shared/constants";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CalendarPlus, ClipboardCheck } from "lucide-react";

type Props = { classId: number };

type Entry = {
  studentId: number;
  participation: number | null;
};

const PARTICIPATION_OPTIONS = [
  ParticipationLevel.NONE,
  ParticipationLevel.MINIMAL,
  ParticipationLevel.ACTIVE,
  ParticipationLevel.EXEMPLARY,
];

function todayAsInput() {
  return new Date().toISOString().slice(0, 10);
}

export function ManageAttendanceDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [newSessionDate, setNewSessionDate] = useState(todayAsInput());
  const [newSessionTopic, setNewSessionTopic] = useState("");
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: classData } = useQuery<Class>({
    queryKey: [`/api/classes/${classId}`],
    enabled: open,
  });

  const { data: students } = useQuery<User[]>({
    queryKey: [`/api/classes/${classId}/students`],
    enabled: open,
  });

  const { data: sessions } = useQuery<ClassSession[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: open,
  });

  const { data: sessionRecords, isLoading: isLoadingRecords } = useQuery<SessionParticipation[]>({
    queryKey: [`/api/classes/${classId}/sessions/${selectedSessionId}/participation`],
    enabled: open && selectedSessionId !== "",
  });

  // Seed the form from whatever is already recorded. Anyone not yet assessed
  // starts as "not recorded", which is deliberately not the same as a zero.
  const rows = (students ?? []).map((student) => {
    const existing = sessionRecords?.find((r) => r.studentId === student.id);
    const entry: Entry = entries[student.id] ?? {
      studentId: student.id,
      participation: existing?.participation ?? null,
    };
    return { student, entry };
  });

  const setEntry = (studentId: number, patch: Partial<Entry>) => {
    setEntries((prev) => {
      const current =
        prev[studentId] ??
        rows.find((r) => r.student.id === studentId)?.entry ?? {
          studentId,
          participation: null,
        };
      return { ...prev, [studentId]: { ...current, ...patch } };
    });
  };

  const createSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/classes/${classId}/sessions`, {
        date: newSessionDate,
        topic: newSessionTopic || null,
      });
      return res.json();
    },
    onSuccess: (session: ClassSession) => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/sessions`] });
      setSelectedSessionId(String(session.id));
      setNewSessionTopic("");
      setEntries({});
      toast({ title: "Session created", description: "Take roll below." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveParticipation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PUT",
        `/api/classes/${classId}/sessions/${selectedSessionId}/participation`,
        { entries: rows.map((r) => r.entry) }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/sessions/${selectedSessionId}/participation`],
      });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/participation`] });
      setEntries({});
      toast({ title: "Saved", description: "Participation recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Record Participation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>In-Class Participation</DialogTitle>
          <DialogDescription>
            Record in-class participation for a session. Participation at
            "{getParticipationLabel(classData?.participationBar ?? DEFAULT_PARTICIPATION_BAR)}" or above counts toward a grade
            contract. Attendance itself is tracked in Qwickly and imported separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-end gap-3 border-b pb-4">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="session-select" className="text-sm font-medium block mb-1">
                Session
              </label>
              <Select value={selectedSessionId} onValueChange={(v) => { setSelectedSessionId(v); setEntries({}); }}>
                <SelectTrigger id="session-select">
                  <SelectValue placeholder="Choose a session" />
                </SelectTrigger>
                <SelectContent>
                  {(sessions ?? []).map((session) => (
                    <SelectItem key={session.id} value={String(session.id)}>
                      {new Date(session.date).toLocaleDateString()}
                      {session.topic ? ` - ${session.topic}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-b pb-4">
            <div>
              <label htmlFor="new-session-date" className="text-sm font-medium block mb-1">
                New session date
              </label>
              <Input
                id="new-session-date"
                type="date"
                value={newSessionDate}
                onChange={(e) => setNewSessionDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label htmlFor="new-session-topic" className="text-sm font-medium block mb-1">
                Topic (optional)
              </label>
              <Input
                id="new-session-topic"
                value={newSessionTopic}
                onChange={(e) => setNewSessionTopic(e.target.value)}
                placeholder="e.g. Peer review workshop"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => createSession.mutate()}
              disabled={createSession.isPending || !newSessionDate}
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CalendarPlus className="h-4 w-4 mr-2" />
              )}
              Add session
            </Button>
          </div>

          {!selectedSessionId ? (
            <p className="text-center text-muted-foreground py-8">
              Choose a session, or add one, to record participation.
            </p>
          ) : isLoadingRecords ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No students enrolled in this class yet.
            </p>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[40vh] pr-3">
                <div className="space-y-2">
                  {rows.map(({ student, entry }) => (
                    <div
                      key={student.id}
                      className="flex flex-wrap items-center gap-3 border rounded-md p-3"
                    >
                      <span className="flex-1 min-w-[160px] font-medium">
                        {student.fullName}
                      </span>

                      <Select
                        value={entry.participation === null ? "none" : String(entry.participation)}
                        onValueChange={(value) =>
                          setEntry(student.id, {
                            participation: value === "none" ? null : parseInt(value),
                          })
                        }
                      >
                        <SelectTrigger className="w-44" aria-label={`Participation for ${student.fullName}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not recorded</SelectItem>
                          {PARTICIPATION_OPTIONS.map((level) => (
                            <SelectItem key={level} value={String(level)}>
                              {level} - {getParticipationLabel(level)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setEntries({})}>
                  Reset
                </Button>
                <Button onClick={() => saveParticipation.mutate()} disabled={saveParticipation.isPending}>
                  {saveParticipation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save participation
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
