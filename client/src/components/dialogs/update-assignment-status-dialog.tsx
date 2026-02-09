import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Assignment, AssignmentProgress } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  classId: number;
  studentId: number;
  assignment: Assignment;
  currentProgress?: AssignmentProgress;
};

const updateAssignmentSchema = z.object({
  status: z.string().optional(),
  numericGrade: z.string().optional(),
}).refine((data) => data.status || data.numericGrade, {
  message: "Either status or numeric grade must be provided"
});

type FormData = z.infer<typeof updateAssignmentSchema>;

export function UpdateAssignmentStatusDialog({ classId, studentId, assignment, currentProgress }: Props) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(updateAssignmentSchema),
    defaultValues: {
      status: currentProgress?.status?.toString() || "",
      numericGrade: currentProgress?.numericGrade?.toString() || "",
    },
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        status: data.status ? parseInt(data.status) : undefined,
        numericGrade: data.numericGrade ? parseFloat(data.numericGrade) : undefined,
        lastUpdated: new Date().toISOString(),
      };

      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/students/${studentId}/assignments/${assignment.id}/progress`,
        payload
      );
      return res.json();
    },
    onSuccess: (updatedProgress) => {
      console.log("Progress updated successfully:", updatedProgress);
      console.log("Invalidating cache keys:");
      console.log(`- /api/classes/${classId}/students/progress`);
      console.log(`- /api/classes/${classId}/students/${studentId}/progress`);
      
      // Invalidate all progress queries to update both instructor and student views
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/students/progress`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/students/${studentId}/progress`],
      });
      toast({
        title: "Success",
        description: "Assignment progress updated successfully",
      });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateProgressMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Update Assignment Progress
          </DialogTitle>
          <DialogDescription>
            Update the {assignment.scoringType === "status" ? "status" : "grade"} for {assignment.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {assignment.scoringType === "status" ? (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Not Submitted</SelectItem>
                        <SelectItem value="2">Work-in-Progress</SelectItem>
                        <SelectItem value="3">Successfully Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="numericGrade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Score (0-4)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="4"
                        step="0.1"
                        placeholder="Enter score"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={updateProgressMutation.isPending}
            >
              Update Progress
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}