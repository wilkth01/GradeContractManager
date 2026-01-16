import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Assignment, GradeContract } from "@shared/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";

// Schema for grade contract form
const editGradeContractSchema = z.object({
  grade: z.enum(["A", "B", "C"]),
  assignments: z.array(z.object({
    id: z.number(),
    comments: z.string().optional(),
  })),
  requiredEngagementIntentions: z.number().default(0),
  maxAbsences: z.number().default(0),
});

type FormData = z.infer<typeof editGradeContractSchema>;

export function EditGradeContractDialog({ 
  classId,
  contract,
  assignments 
}: { 
  classId: number;
  contract: GradeContract;
  assignments: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>(
    contract.assignments.map(a => a.id)
  );

  const form = useForm<FormData>({
    resolver: zodResolver(editGradeContractSchema),
    defaultValues: {
      grade: contract.grade,
      assignments: contract.assignments,
      requiredEngagementIntentions: contract.requiredEngagementIntentions || 0,
      maxAbsences: contract.maxAbsences || 0,
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest(
        "PATCH",
        `/api/classes/${classId}/contracts/${contract.id}`,
        {
          ...data,
          version: contract.version + 1,
        }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/contracts`],
      });
      toast({
        title: "Success",
        description: "Grade contract updated successfully",
      });
      setOpen(false);
      form.reset();
      setSelectedAssignments([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();

    // Create assignments array with selected assignments and their comments
    const assignmentsWithComments = selectedAssignments.map(id => {
      const existingAssignment = contract.assignments.find(a => a.id === id);
      return {
        id,
        comments: form.getValues(`assignmentComments.${id}`) || existingAssignment?.comments,
      };
    });

    const formData = {
      grade: values.grade,
      requiredEngagementIntentions: values.requiredEngagementIntentions,
      maxAbsences: values.maxAbsences,
      assignments: assignmentsWithComments,
      version: contract.version + 1,
    };

    try {
      await updateContractMutation.mutateAsync(formData);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const handleCheckboxChange = (assignmentId: number, checked: boolean) => {
    setSelectedAssignments(prev => 
      checked 
        ? [...prev, assignmentId]
        : prev.filter(id => id !== assignmentId)
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Grade Contract</DialogTitle>
          <DialogDescription>
            Update requirements for this grade level
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="grade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grade Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grade level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="A">A Grade</SelectItem>
                      <SelectItem value="B">B Grade</SelectItem>
                      <SelectItem value="C">C Grade</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requiredEngagementIntentions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required Engagement Intentions</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g., 8"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-sm text-muted-foreground">
                    Number of engagement intentions students must fulfill for this grade. Set to 0 if not required.
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="maxAbsences"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Allowed Absences</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g., 3"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : 0)}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-sm text-muted-foreground">
                    Number of absences allowed for this grade level. Set to 0 for perfect attendance requirement.
                  </p>
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Required Assignments</FormLabel>
              <div className="border rounded-lg p-4 space-y-4">
                {assignments.map((assignment) => {
                  const existingAssignment = contract.assignments.find(a => a.id === assignment.id);
                  return (
                    <div key={assignment.id} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={selectedAssignments.includes(assignment.id)}
                          onCheckedChange={(checked) => 
                            handleCheckboxChange(assignment.id, checked as boolean)
                          }
                        />
                        <label className="text-sm font-medium">{assignment.name}</label>
                      </div>
                      {selectedAssignments.includes(assignment.id) && (
                        <FormField
                          control={form.control}
                          name={`assignmentComments.${assignment.id}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  placeholder="Add optional requirements or notes for this assignment"
                                  className="h-20"
                                  defaultValue={existingAssignment?.comments}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={updateContractMutation.isPending}
            >
              Update Contract
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}