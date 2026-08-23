import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertClassSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormData = {
  name: string;
  description?: string;
  semesterStartDate?: string;
  canvasCourseId?: number | null;
};

interface CanvasConnection {
  connected: boolean;
}

interface CanvasCourse {
  id: number;
  name: string;
  courseCode?: string;
}

export function CreateClassDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Default to current date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const form = useForm<FormData>({
    resolver: zodResolver(insertClassSchema),
    defaultValues: {
      name: "",
      description: "",
      semesterStartDate: today,
      canvasCourseId: null,
    },
  });

  const { data: connection } = useQuery<CanvasConnection>({
    queryKey: ["/api/canvas/connection"],
    enabled: open,
  });

  const { data: canvasCourses } = useQuery<CanvasCourse[]>({
    queryKey: ["/api/canvas/courses"],
    enabled: open && !!connection?.connected,
  });

  const createClassMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/classes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({
        title: "Success",
        description: "Class created successfully",
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="text-base">Create New Class</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create New Class</DialogTitle>
          <DialogDescription className="text-base">
            Add a new class to your teaching schedule with semester settings.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => createClassMutation.mutate(data))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., ENG 101, Spring 2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the course content and objectives..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="semesterStartDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Semester Start Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-sm text-muted-foreground">
                    Used to work out which week of the semester the class is in
                  </p>
                </FormItem>
              )}
            />
            {connection?.connected && (
              <FormField
                control={form.control}
                name="canvasCourseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canvas Course (optional)</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : "__none__"}
                      onValueChange={(value) =>
                        field.onChange(value === "__none__" ? null : parseInt(value))
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Not linked" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Not linked</SelectItem>
                        {(canvasCourses ?? []).map((course) => (
                          <SelectItem key={course.id} value={String(course.id)}>
                            {course.name}
                            {course.courseCode ? ` (${course.courseCode})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    <p className="text-sm text-muted-foreground">
                      Link now and you can import the roster straight from Canvas.
                    </p>
                  </FormItem>
                )}
              />
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={createClassMutation.isPending}
            >
              Create Class
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}