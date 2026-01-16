import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Mail, Copy, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Student {
  email: string;
  fullName: string;
}

interface InviteStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: number;
  className: string;
}

export function InviteStudentsDialog({
  open,
  onOpenChange,
  classId,
  className,
}: InviteStudentsDialogProps) {
  const [students, setStudents] = useState<Student[]>([{ email: "", fullName: "" }]);
  const [isCreatingInvitations, setIsCreatingInvitations] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [showEmailTemplates, setShowEmailTemplates] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const { toast } = useToast();

  const addStudent = () => {
    setStudents([...students, { email: "", fullName: "" }]);
  };

  const removeStudent = (index: number) => {
    setStudents(students.filter((_, i) => i !== index));
  };

  const updateStudent = (index: number, field: keyof Student, value: string) => {
    const updated = [...students];
    updated[index][field] = value;
    setStudents(updated);
  };

  const handleBulkPaste = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const newStudents: Student[] = [];
    
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map(part => part.trim());
      if (parts.length >= 2) {
        newStudents.push({
          email: parts[0],
          fullName: parts[1],
        });
      } else if (parts.length === 1 && parts[0].includes('@')) {
        newStudents.push({
          email: parts[0],
          fullName: parts[0].split('@')[0],
        });
      }
    }
    
    if (newStudents.length > 0) {
      setStudents(prev => [...prev, ...newStudents]);
      toast({
        title: "Students Added",
        description: `Added ${newStudents.length} students from paste.`,
      });
    }
  };

  const createInvitations = async () => {
    const validStudents = students.filter(s => s.email && s.fullName);
    
    if (validStudents.length === 0) {
      toast({
        title: "No valid students",
        description: "Please add at least one student with both email and name.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingInvitations(true);
    const createdInvitations = [];

    try {
      for (const student of validStudents) {
        const response = await apiRequest("POST", `/api/classes/${classId}/invitations`, student);
        const data = await response.json();
        createdInvitations.push(data);
      }

      setInvitations(createdInvitations);
      toast({
        title: "Invitations Created",
        description: `Created ${createdInvitations.length} student invitations.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create invitations.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingInvitations(false);
    }
  };

  const generateEmailTemplates = async () => {
    if (invitations.length === 0) return;

    try {
      const response = await apiRequest("POST", `/api/classes/${classId}/email-template`, { invitations });
      const data = await response.json();
      
      setEmailTemplates(data.emailTemplates);
      setShowEmailTemplates(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate email templates.",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard.",
    });
  };

  const handleClose = () => {
    setStudents([{ email: "", fullName: "" }]);
    setInvitations([]);
    setEmailTemplates([]);
    setShowEmailTemplates(false);
    onOpenChange(false);
  };

  if (showEmailTemplates) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Templates - {className}</DialogTitle>
            <DialogDescription>
              Copy these email templates and send them to your students through your preferred email client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {emailTemplates.map((template, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">To: {template.email}</Label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(`To: ${template.email}\nSubject: ${template.subject}\n\n${template.body}`)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Email
                  </Button>
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Subject:</Label>
                  <Input 
                    value={template.subject} 
                    readOnly 
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label className="text-sm font-medium">Message:</Label>
                  <Textarea 
                    value={template.body} 
                    readOnly 
                    rows={12}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailTemplates(false)}>
              Back to Invitations
            </Button>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Students - {className}</DialogTitle>
          <DialogDescription>
            Create login invitations for students. They'll receive secure links to set up their accounts.
          </DialogDescription>
        </DialogHeader>

        {invitations.length === 0 ? (
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>You can add students individually or paste a list:</p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Format: email, full name (comma or tab separated)</li>
                  <li>One student per line</li>
                  <li>Example: john@widener.edu, John Smith</li>
                </ul>
              </div>

              <div>
                <Label>Quick Add (Paste List)</Label>
                <Textarea
                  placeholder="Paste student list here...&#10;john@widener.edu, John Smith&#10;jane@widener.edu, Jane Doe"
                  onChange={(e) => {
                    if (e.target.value.includes('\n') || e.target.value.includes('\t')) {
                      handleBulkPaste(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Individual Students</Label>
                <Button size="sm" variant="outline" onClick={addStudent}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Student
                </Button>
              </div>

              {students.map((student, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-sm">Email</Label>
                    <Input
                      type="email"
                      value={student.email}
                      onChange={(e) => updateStudent(index, 'email', e.target.value)}
                      placeholder="student@widener.edu"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-sm">Full Name</Label>
                    <Input
                      value={student.fullName}
                      onChange={(e) => updateStudent(index, 'fullName', e.target.value)}
                      placeholder="Student Name"
                    />
                  </div>
                  {students.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeStudent(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {invitations.length} invitations created
              </Badge>
            </div>

            <div className="space-y-2">
              <Label>Created Invitations:</Label>
              {invitations.map((invitation, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{invitation.fullName}</div>
                    <div className="text-sm text-muted-foreground">{invitation.email}</div>
                  </div>
                  <Badge variant="outline">Ready to send</Badge>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Next Steps:</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Click "Generate Email Templates" below</li>
                <li>Copy the email content for each student</li>
                <li>Send emails through your preferred email client</li>
                <li>Students will click the link to set up their accounts</li>
              </ol>
            </div>
          </div>
        )}

        <DialogFooter>
          {invitations.length === 0 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={createInvitations} 
                disabled={isCreatingInvitations}
              >
                {isCreatingInvitations ? "Creating..." : "Create Invitations"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={generateEmailTemplates}>
                <Mail className="h-4 w-4 mr-2" />
                Generate Email Templates
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}