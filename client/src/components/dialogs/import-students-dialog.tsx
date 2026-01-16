import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload } from "lucide-react";

type StudentData = {
  username: string;
  fullName: string;
  email: string;
  password: string;
};

type Props = {
  classId: number;
};

export function ImportStudentsDialog({ classId }: Props) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (students: StudentData[]) => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/students/import`,
        { students }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/students`] });
      toast({
        title: "Success",
        description: "Students imported successfully",
      });
      setOpen(false);
      setStudents([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');

        // Parse CSV respecting quotes
        const parseCSVLine = (line: string) => {
          const values = [];
          let value = '';
          let insideQuotes = false;

          for (let char of line) {
            if (char === '"') {
              insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
              values.push(value.trim());
              value = '';
            } else {
              value += char;
            }
          }
          values.push(value.trim());
          return values;
        };

        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

        // Validate required columns
        const requiredColumns = ["username", "fullname", "email", "password"];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));

        if (missingColumns.length > 0) {
          throw new Error(`CSV must include the following columns: ${missingColumns.join(", ")}`);
        }

        const parsedStudents = lines
          .slice(1) // Skip header row
          .filter(line => line.trim()) // Skip empty lines
          .map(line => {
            const values = parseCSVLine(line);
            const student: StudentData = {
              username: values[headers.indexOf("username")].trim(),
              fullName: values[headers.indexOf("fullname")].trim().replace(/^"|"$/g, ''), // Remove surrounding quotes if present
              email: values[headers.indexOf("email")].trim(),
              password: values[headers.indexOf("password")].trim(),
            };

            // Validate required fields
            const missingFields = Object.entries(student)
              .filter(([_, value]) => !value)
              .map(([key]) => key);

            if (missingFields.length > 0) {
              throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
            }

            return student;
          });

        setStudents(parsedStudents);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV file");
        setStudents([]);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Import Students
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Students</DialogTitle>
          <DialogDescription>
            Upload a CSV file with student information. The file must include the following columns:
            'username', 'fullname', 'email', and 'password'.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {students.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Preview ({students.length} students):</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {students.slice(0, 5).map((student, index) => (
                  <div key={index} className="text-sm">
                    {student.fullName} ({student.username}) - {student.email}
                  </div>
                ))}
                {students.length > 5 && (
                  <div className="text-sm text-muted-foreground">
                    ...and {students.length - 5} more
                  </div>
                )}
              </div>
              <Button
                onClick={() => importMutation.mutate(students)}
                disabled={importMutation.isPending}
                className="w-full"
              >
                Import {students.length} Students
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}