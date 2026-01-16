
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { User, CalendarDays, Loader2 } from "lucide-react";
import { format } from "date-fns";

type AttendanceRecord = {
  id: number;
  studentId: number;
  classId: number;
  date: string;
  isPresent: boolean;
  notes?: string;
};

type Student = {
  id: number;
  username: string;
  fullName: string;
};

type Props = {
  classId: number;
  className: string;
};

export function ManageAttendanceDialog({ classId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendanceData, setAttendanceData] = useState<Record<number, { isPresent: boolean; notes: string }>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch enrolled students
  const { data: students, isLoading: isLoadingStudents } = useQuery<Student[]>({
    queryKey: [`/api/classes/${classId}/enrolled-students`],
    enabled: open,
  });

  // Fetch attendance records for selected date
  const { data: existingRecords, isLoading: isLoadingRecords } = useQuery<AttendanceRecord[]>({
    queryKey: [`/api/classes/${classId}/attendance`, selectedDate],
    queryFn: async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await apiRequest("GET", `/api/classes/${classId}/attendance?date=${dateStr}`);
      return res.json();
    },
    enabled: open && !!selectedDate,
  });

  // Initialize attendance data when records are loaded
  useState(() => {
    if (existingRecords && students) {
      const data: Record<number, { isPresent: boolean; notes: string }> = {};
      students.forEach(student => {
        const record = existingRecords.find(r => r.studentId === student.id);
        data[student.id] = {
          isPresent: record?.isPresent ?? true,
          notes: record?.notes || "",
        };
      });
      setAttendanceData(data);
    }
  });

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const records = Object.entries(attendanceData).map(([studentId, data]) => ({
        studentId: parseInt(studentId),
        classId,
        date: dateStr,
        isPresent: data.isPresent,
        notes: data.notes,
      }));

      const res = await apiRequest("POST", `/api/classes/${classId}/attendance/batch`, { records });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/attendance`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/students`] });
      toast({
        title: "Success",
        description: "Attendance records saved successfully",
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleAttendance = (studentId: number) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        isPresent: !prev[studentId]?.isPresent,
      },
    }));
  };

  const updateNotes = (studentId: number, notes: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        notes,
      },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="text-base text-black">
          <CalendarDays className="h-5 w-5 mr-2" />
          Manage Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Attendance - {className}</DialogTitle>
          <DialogDescription>
            Record attendance for students on a specific date
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[300px_1fr] gap-6">
          <div>
            <Label className="mb-2 block">Select Date</Label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {format(selectedDate, 'MMMM d, yyyy')}
              </h3>
              <div className="text-sm text-muted-foreground">
                {students && Object.values(attendanceData).filter(d => d.isPresent).length} / {students?.length || 0} present
              </div>
            </div>

            {isLoadingStudents || isLoadingRecords ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {students?.map((student) => (
                  <div key={student.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{student.fullName}</div>
                          <div className="text-sm text-muted-foreground">{student.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`present-${student.id}`}
                          checked={attendanceData[student.id]?.isPresent ?? true}
                          onCheckedChange={() => toggleAttendance(student.id)}
                        />
                        <Label htmlFor={`present-${student.id}`} className="cursor-pointer">
                          Present
                        </Label>
                      </div>
                    </div>
                    
                    {!attendanceData[student.id]?.isPresent && (
                      <div>
                        <Label className="text-sm">Notes (optional)</Label>
                        <Textarea
                          placeholder="Reason for absence..."
                          value={attendanceData[student.id]?.notes || ""}
                          onChange={(e) => updateNotes(student.id, e.target.value)}
                          className="mt-1"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={() => saveAttendanceMutation.mutate()}
              disabled={saveAttendanceMutation.isPending || !students?.length}
              className="w-full"
            >
              {saveAttendanceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Attendance"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
