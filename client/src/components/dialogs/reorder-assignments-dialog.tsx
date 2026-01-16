import { useState, useEffect } from "react";
import { Assignment } from "@shared/schema";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

type Props = {
  classId: number;
  assignments: Assignment[];
};

export function ReorderAssignmentsDialog({ classId, assignments }: Props) {
  const [open, setOpen] = useState(false);
  const [orderedAssignments, setOrderedAssignments] = useState<Assignment[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize ordered assignments when dialog opens
  useEffect(() => {
    if (open) {
      setOrderedAssignments([...assignments]);
    }
  }, [open, assignments]);

  const reorderMutation = useMutation({
    mutationFn: async (assignmentIds: number[]) => {
      const res = await apiRequest(
        "PUT",
        `/api/classes/${classId}/assignments/reorder`,
        { assignmentIds }
      );
      if (!res.ok) {
        throw new Error("Failed to reorder assignments");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/assignments`],
      });
      toast({
        title: "Success",
        description: "Assignment order updated",
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

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...orderedAssignments];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrderedAssignments(newOrder);
  };

  const moveDown = (index: number) => {
    if (index === orderedAssignments.length - 1) return;
    const newOrder = [...orderedAssignments];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrderedAssignments(newOrder);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...orderedAssignments];
    const draggedItem = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);
    setOrderedAssignments(newOrder);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = () => {
    const assignmentIds = orderedAssignments.map((a) => a.id);
    reorderMutation.mutate(assignmentIds);
  };

  const hasChanges = JSON.stringify(orderedAssignments.map(a => a.id)) !==
    JSON.stringify(assignments.map(a => a.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowUpDown className="h-4 w-4 mr-2" />
          Reorder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reorder Assignments</DialogTitle>
          <DialogDescription>
            Drag and drop or use arrows to change the order. This order will be shown to students.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-2">
            {orderedAssignments.map((assignment, index) => (
              <div
                key={assignment.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 bg-muted/50 rounded-lg border cursor-move transition-colors ${
                  draggedIndex === index ? "opacity-50 border-primary" : "hover:bg-muted"
                }`}
              >
                <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{assignment.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.moduleGroup || "No module"} · {assignment.scoringType}
                  </p>
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveDown(index)}
                    disabled={index === orderedAssignments.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={reorderMutation.isPending || !hasChanges}
          >
            {reorderMutation.isPending ? "Saving..." : "Save Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
