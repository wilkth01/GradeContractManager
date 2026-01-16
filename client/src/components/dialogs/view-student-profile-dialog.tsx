import { User, GradeContract } from "@shared/schema";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User as UserIcon } from "lucide-react";
import { StudentHistory } from "@/components/student/StudentHistory";

type Props = {
  student: User;
  classId: number;
};

type StudentContract = {
  contractId: number;
  // Add other properties as needed based on the API response
};

export function ViewStudentProfileDialog({ student, classId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available grade contracts
  const { data: contracts } = useQuery<GradeContract[]>({
    queryKey: [`/api/classes/${classId}/contracts`],
  });

  // Fetch student's current contract
  const { data: studentContract } = useQuery<StudentContract>({
    queryKey: [`/api/classes/${classId}/students/${student.id}/contract`],
  });

  const setContractMutation = useMutation({
    mutationFn: async (contractId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/classes/${classId}/students/${student.id}/contract`,
        { contractId }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/classes/${classId}/students/${student.id}/contract`],
      });
      toast({
        title: "Success",
        description: "Grade contract updated successfully",
      });
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
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserIcon className="h-4 w-4 mr-2" />
          View Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student Profile</DialogTitle>
          <DialogDescription>
            Detailed information about {student.fullName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="font-medium">Full Name</p>
                <p className="text-sm text-muted-foreground">{student.fullName}</p>
              </div>
              <div>
                <p className="font-medium">Username</p>
                <p className="text-sm text-muted-foreground">{student.username}</p>
              </div>
              <div>
                <p className="font-medium">Role</p>
                <p className="text-sm text-muted-foreground capitalize">{student.role}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Grade Contract</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-medium mb-2">Selected Contract</p>
                <Select
                  value={studentContract?.contractId?.toString()}
                  onValueChange={(value) => setContractMutation.mutate(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a grade contract" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts?.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id.toString()}>
                        Grade {contract.grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {studentContract && contracts && (
                <div>
                  <p className="font-medium">Current Contract Details</p>
                  <p className="text-sm text-muted-foreground">
                    Grade {contracts.find(c => c.id === studentContract.contractId)?.grade}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <StudentHistory classId={classId} studentId={student.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}