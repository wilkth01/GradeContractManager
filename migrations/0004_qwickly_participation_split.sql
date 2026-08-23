-- Split attendance from participation.
--
-- Widener requires Qwickly, which owns attendance and computes its own absence
-- total (a Partial / Late-Left-Early day counts as half, so totals look like
-- 7.50). That total is imported rather than re-derived, so this app no longer
-- records attendance states at all -- only in-class participation, which
-- Qwickly does not track.
--
-- drizzle-kit generated this as a bare DROP TABLE "attendance_records" CASCADE,
-- which would discard everything migration 0003 just carried across. The body
-- below moves participation into its new home and rolls the recorded absences
-- up into a per-student total before dropping the old table.

CREATE TABLE "session_participation" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"participation" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "participation_session_student_unique" UNIQUE("session_id","student_id")
);
--> statement-breakpoint

CREATE TABLE "student_absences" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"absences" numeric(5, 2) NOT NULL,
	"source" text DEFAULT 'canvas' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "absences_student_class_unique" UNIQUE("student_id","class_id")
);
--> statement-breakpoint

ALTER TABLE "session_participation" ADD CONSTRAINT "session_participation_session_id_class_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_participation" ADD CONSTRAINT "session_participation_student_id_users_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_absences" ADD CONSTRAINT "student_absences_student_id_users_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_absences" ADD CONSTRAINT "student_absences_class_id_classes_id_fk"
  FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Participation carries over as-is.
INSERT INTO "session_participation" ("session_id", "student_id", "participation", "notes", "created_at")
SELECT "session_id", "student_id", "participation", "notes", "created_at"
FROM "attendance_records";
--> statement-breakpoint

-- Recorded absences roll up into a per-student total, marked as migrated so it
-- is distinguishable from a Qwickly import. Students with a clean record get an
-- explicit 0 rather than a missing row.
INSERT INTO "student_absences" ("student_id", "class_id", "absences", "source")
SELECT ar."student_id",
       cs."class_id",
       COUNT(*) FILTER (WHERE ar."attendance" = 'absent'),
       'migrated'
FROM "attendance_records" ar
JOIN "class_sessions" cs ON cs."id" = ar."session_id"
GROUP BY ar."student_id", cs."class_id";
--> statement-breakpoint

DROP TABLE "attendance_records" CASCADE;
