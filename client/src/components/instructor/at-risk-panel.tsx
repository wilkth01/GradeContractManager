import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { AtRiskStudent } from "@shared/contract-risk";

interface AtRiskResponse {
  absenceHighlightThreshold: number;
  classes: {
    classId: number;
    className: string;
    red: AtRiskStudent[];
    yellow: AtRiskStudent[];
  }[];
}

const TONES = {
  red: {
    label: "Red",
    blurb: "Needs attention now",
    box: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    heading: "text-red-800 dark:text-red-300",
    dot: "bg-red-600",
  },
  yellow: {
    label: "Yellow",
    blurb: "Falling behind",
    box: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
    heading: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
} as const;

function StudentRow({ student, threshold }: { student: AtRiskStudent; threshold: number }) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Subject: ${student.emailSubject}\n\n${student.emailBody}`
      );
      toast({
        title: "Message copied",
        description: student.email
          ? `Paste it into an email to ${student.email}.`
          : `Paste it into an email to ${student.fullName}.`,
      });
    } catch {
      toast({
        title: "Could not copy",
        description: "Your browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <li className="rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{student.fullName}</span>
        <Badge variant="outline">{student.contractGrade} contract</Badge>
        {student.manyAbsences && (
          <Badge
            className="border-transparent bg-orange-600 text-white hover:bg-orange-600"
            title={`More than ${threshold} absences recorded`}
          >
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
            {student.absences} absences
          </Badge>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={copy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Copy email
        </Button>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">{student.reasons.join(" · ")}</p>

      {student.steps.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium">To get back into compliance:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {student.steps.map((step) => (
              <li key={step}>{step.charAt(0).toUpperCase() + step.slice(1)}</li>
            ))}
          </ul>
        </div>
      )}

      {student.overAbsenceLimit && (
        <p className="mt-2 text-sm">
          Absences cannot be made up.{" "}
          {student.currentlyMeets
            ? `Currently meeting the ${student.currentlyMeets} contract.`
            : "Not currently meeting any contract."}
        </p>
      )}
    </li>
  );
}

export function AtRiskPanel() {
  const [, setLocation] = useLocation();

  // The app-wide default never refetches; this has to reflect the latest
  // grades and attendance every time the dashboard opens.
  const { data, isLoading, error } = useQuery<AtRiskResponse>({
    queryKey: ["/api/instructor/at-risk"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking student standing…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Could not load the at-risk students list.
        </CardContent>
      </Card>
    );
  }

  const flagged = data.classes.filter((c) => c.red.length + c.yellow.length > 0);
  const redTotal = data.classes.reduce((n, c) => n + c.red.length, 0);
  const yellowTotal = data.classes.reduce((n, c) => n + c.yellow.length, 0);

  if (flagged.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
          <span className="text-sm">
            No students are out of compliance with their contracts right now.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
          Students out of compliance
        </CardTitle>
        <CardDescription>
          {redTotal} red, {yellowTotal} yellow. Red means missed work that cannot be made up by
          waiting, an absence problem, or two or more required items behind; yellow means one
          item behind or no absences to spare. Work not yet due is never counted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {flagged.map((cls) => (
          <ClassSection
            key={cls.classId}
            cls={cls}
            threshold={data.absenceHighlightThreshold}
            onOpen={() => setLocation(`/instructor/class/${cls.classId}`)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ClassSection({
  cls,
  threshold,
  onOpen,
}: {
  cls: AtRiskResponse["classes"][number];
  threshold: number;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section aria-label={`${cls.className} students out of compliance`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-lg font-semibold hover:underline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {cls.className}
        </button>
        {cls.red.length > 0 && (
          <Badge className="border-transparent bg-red-600 text-white hover:bg-red-600">
            {cls.red.length} red
          </Badge>
        )}
        {cls.yellow.length > 0 && (
          <Badge className="border-transparent bg-amber-500 text-black hover:bg-amber-500">
            {cls.yellow.length} yellow
          </Badge>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onOpen}>
          Open class
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-4">
          {(["red", "yellow"] as const).map((level) => {
            const students = cls[level];
            if (students.length === 0) return null;
            const tone = TONES[level];
            return (
              <div key={level} className={`rounded-lg border p-3 ${tone.box}`}>
                <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${tone.heading}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                  {tone.label} · {tone.blurb}
                </h3>
                <ul className="space-y-2">
                  {students.map((student) => (
                    <StudentRow key={student.studentId} student={student} threshold={threshold} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
