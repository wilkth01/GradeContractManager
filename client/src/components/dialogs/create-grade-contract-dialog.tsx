import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Assignment } from "@shared/schema";
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
import { ScrollArea } from "@/components/ui/scroll-area";

const createGradeContractSchema = z.object({
  grade: z.enum(["A", "B", "C"]),
  assignments: z.array(z.object({
    id: z.number(),
    comments: z.string().optional(),
    minPoints: z.number().min(0).optional(),
  })),
  requiredEngagementIntentions: z.number().default(0),
  maxAbsences: z.number().default(0),
  categoryRequirements: z.array(z.object({
    category: z.string(),
    required: z.number().min(1),
  })).optional(),
});

type FormData = z.infer<typeof createGradeContractSchema>;
type CategoryRequirement = { category: string; required: number };
type AssignmentMinPoints = Record<number, number | undefined>;

export function CreateGradeContractDialog({
  classId,
  assignments
}: {
  classId: number;
  assignments: Assignment[];
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [categoryRequirements, setCategoryRequirements] = useState<Record<string, number | null>>({});
  const [minPointsRequirements, setMinPointsRequirements] = useState<AssignmentMinPoints>({});

  const form = useForm<FormData>({
    resolver: zodResolver(createGradeContractSchema),
    defaultValues: {
      grade: "A",
      assignments: [],
      requiredEngagementIntentions: 0,
      maxAbsences: 0,
      categoryRequirements: [],
    },
  });

  // Group assignments by module group
  const assignmentsByCategory = assignments.reduce((acc, assignment) => {
    const category = assignment.moduleGroup || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(assignment);
    return acc;
  }, {} as Record<string, Assignment[]>);

  // Get categories that have at least one selected assignment
  const selectedCategories = Object.entries(assignmentsByCategory)
    .filter(([_, categoryAssignments]) =>
      categoryAssignments.some(a => selectedAssignments.includes(a.id))
    )
    .map(([category, categoryAssignments]) => ({
      category,
      totalSelected: categoryAssignments.filter(a => selectedAssignments.includes(a.id)).length
    }));

  const createContractMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/contracts`,
        {
          ...data,
          version: 1,
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
        description: "Grade contract created successfully",
      });
      setOpen(false);
      form.reset();
      setSelectedAssignments([]);
      setCategoryRequirements({});
      setMinPointsRequirements({});
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

    // Build category requirements array from state
    const categoryReqs: CategoryRequirement[] = Object.entries(categoryRequirements)
      .filter(([_, required]) => required !== null && required > 0)
      .map(([category, required]) => ({ category, required: required as number }));

    // Add minPoints to assignments that have them
    const assignmentsWithMinPoints = values.assignments.map(a => ({
      ...a,
      minPoints: minPointsRequirements[a.id],
    }));

    createContractMutation.mutate({
      ...values,
      assignments: assignmentsWithMinPoints,
      categoryRequirements: categoryReqs.length > 0 ? categoryReqs : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Grade Contract</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Create Grade Contract</DialogTitle>
          <DialogDescription>
            Define requirements for achieving each grade level.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <ScrollArea className="h-[70vh]">
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
                <p className="font-medium">Select Required Assignments</p>
                {Object.entries(assignmentsByCategory).map(([category, categoryAssignments]) => (
                  <div key={category} className="space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">{category}</p>
                    {categoryAssignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-start space-x-3 space-y-0 ml-4">
                        <Checkbox
                          checked={selectedAssignments.includes(assignment.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedAssignments([...selectedAssignments, assignment.id]);
                              const currentAssignments = form.getValues("assignments");
                              form.setValue("assignments", [...currentAssignments, { id: assignment.id }]);
                            } else {
                              setSelectedAssignments(selectedAssignments.filter(id => id !== assignment.id));
                              const currentAssignments = form.getValues("assignments");
                              form.setValue("assignments", currentAssignments.filter(a => a.id !== assignment.id));
                              // Also remove minPoints requirement
                              setMinPointsRequirements(prev => {
                                const { [assignment.id]: _, ...rest } = prev;
                                return rest;
                              });
                            }
                          }}
                        />
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium leading-none">{assignment.name}</p>
                            {assignment.scoringType === "numeric" && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Points</span>
                            )}
                          </div>
                          {selectedAssignments.includes(assignment.id) && (
                            <div className="space-y-2">
                              {assignment.scoringType === "numeric" && (
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder="Min points"
                                    className="w-28"
                                    value={minPointsRequirements[assignment.id] ?? ""}
                                    onChange={(e) => {
                                      const value = e.target.value ? parseFloat(e.target.value) : undefined;
                                      setMinPointsRequirements(prev => ({
                                        ...prev,
                                        [assignment.id]: value
                                      }));
                                    }}
                                  />
                                  <span className="text-xs text-muted-foreground">minimum points required</span>
                                </div>
                              )}
                              <Textarea
                                placeholder="Add specific requirements or comments (optional)"
                                className="mt-2"
                                onChange={(e) => {
                                  const currentAssignments = form.getValues("assignments");
                                  const index = currentAssignments.findIndex(a => a.id === assignment.id);
                                  if (index !== -1) {
                                    currentAssignments[index].comments = e.target.value;
                                    form.setValue("assignments", currentAssignments);
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Category Requirements Section */}
              {selectedCategories.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <p className="font-medium">Category Completion Requirements</p>
                    <p className="text-sm text-muted-foreground">
                      Optionally specify how many assignments must be completed within each category.
                      Leave blank to require all selected assignments in that category.
                    </p>
                  </div>
                  {selectedCategories.map(({ category, totalSelected }) => (
                    <div key={category} className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{category}</p>
                        <p className="text-xs text-muted-foreground">
                          {totalSelected} assignment{totalSelected !== 1 ? "s" : ""} selected
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max={totalSelected}
                          placeholder="All"
                          className="w-20"
                          value={categoryRequirements[category] ?? ""}
                          onChange={(e) => {
                            const value = e.target.value ? parseInt(e.target.value) : null;
                            setCategoryRequirements(prev => ({
                              ...prev,
                              [category]: value
                            }));
                          }}
                        />
                        <span className="text-sm text-muted-foreground">required</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button type="submit" className="w-full">Create Contract</Button>
            </form>
          </ScrollArea>
        </Form>
      </DialogContent>
    </Dialog>
  );
}