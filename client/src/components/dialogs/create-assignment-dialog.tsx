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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

type AssignmentRow = {
  id: string;
  name: string;
  moduleGroup: string;
  scoringType: "status" | "numeric";
  dueDate: string;
};

function createEmptyRow(): AssignmentRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    moduleGroup: "",
    scoringType: "status",
    dueDate: "",
  };
}

export function CreateAssignmentDialog({ classId }: { classId: number }) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([createEmptyRow()]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createAssignmentsMutation = useMutation({
    mutationFn: async (data: AssignmentRow[]) => {
      // Filter out empty assignments
      const validAssignments = data.filter((a) => a.name.trim() !== "");

      if (validAssignments.length === 0) {
        throw new Error("Please add at least one assignment with a name");
      }

      // Create all assignments in parallel
      const results = await Promise.all(
        validAssignments.map(async (assignment) => {
          const res = await apiRequest(
            "POST",
            `/api/classes/${classId}/assignments`,
            {
              name: assignment.name,
              moduleGroup: assignment.moduleGroup || null,
              scoringType: assignment.scoringType,
              dueDate: assignment.dueDate || null,
              classId,
            }
          );
          return res.json();
        })
      );

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/assignments`],
      });
      toast({
        title: "Success",
        description: `${results.length} assignment${results.length > 1 ? "s" : ""} created successfully`,
      });
      setOpen(false);
      setAssignments([createEmptyRow()]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addRow = () => {
    setAssignments([...assignments, createEmptyRow()]);
  };

  const removeRow = (id: string) => {
    if (assignments.length > 1) {
      setAssignments(assignments.filter((a) => a.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof AssignmentRow, value: string) => {
    setAssignments(
      assignments.map((a) =>
        a.id === id ? { ...a, [field]: value } : a
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAssignmentsMutation.mutate(assignments);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when dialog closes
      setAssignments([createEmptyRow()]);
    }
  };

  const validCount = assignments.filter((a) => a.name.trim() !== "").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Add Assignments</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Assignments</DialogTitle>
          <DialogDescription>
            Add one or more assignments to your class. Click "Add Another" to create multiple assignments at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_120px_120px_140px_40px] gap-3 text-sm font-medium text-muted-foreground">
              <div>Assignment Name *</div>
              <div>Module/Group</div>
              <div>Due Date</div>
              <div>Scoring Type</div>
              <div></div>
            </div>

            {/* Assignment rows */}
            {assignments.map((assignment, index) => (
              <div
                key={assignment.id}
                className="grid grid-cols-[1fr_120px_120px_140px_40px] gap-3 items-center"
              >
                <Input
                  placeholder="e.g., Essay 1"
                  value={assignment.name}
                  onChange={(e) => updateRow(assignment.id, "name", e.target.value)}
                  required={index === 0}
                />
                <Input
                  placeholder="Module 1"
                  value={assignment.moduleGroup}
                  onChange={(e) => updateRow(assignment.id, "moduleGroup", e.target.value)}
                />
                <Input
                  type="date"
                  value={assignment.dueDate}
                  onChange={(e) => updateRow(assignment.id, "dueDate", e.target.value)}
                />
                <Select
                  value={assignment.scoringType}
                  onValueChange={(value) => updateRow(assignment.id, "scoringType", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="numeric">Numeric</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(assignment.id)}
                  disabled={assignments.length === 1}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Assignment
          </Button>

          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {validCount} assignment{validCount !== 1 ? "s" : ""} to create
            </p>
            <Button
              type="submit"
              disabled={createAssignmentsMutation.isPending || validCount === 0}
            >
              {createAssignmentsMutation.isPending
                ? "Creating..."
                : `Create ${validCount} Assignment${validCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
