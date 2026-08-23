-- Move attendance onto explicit class sessions, and add in-class participation.
--
-- The shape this produces is exactly what drizzle-kit generated from the schema;
-- the body is hand-written because the generated version was destructive. It
-- added session_id as NOT NULL with no default (which fails outright on a
-- populated table) and then dropped class_id, date and is_present, discarding
-- every attendance record. The steps below backfill sessions from the dates
-- already recorded, then carry each record across.

CREATE TABLE "class_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"topic" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_sessions_class_date_unique" UNIQUE("class_id","date")
);
--> statement-breakpoint

ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk"
  FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- One session per class per day that attendance was already recorded for.
INSERT INTO "class_sessions" ("class_id", "date")
SELECT DISTINCT "class_id", date_trunc('day', "date")
FROM "attendance_records";
--> statement-breakpoint

-- Nullable for now so existing rows can be backfilled before the constraint.
ALTER TABLE "attendance_records" ADD COLUMN "session_id" integer;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "attendance" text DEFAULT 'present' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "participation" integer;
--> statement-breakpoint

UPDATE "attendance_records" ar
SET "session_id" = cs."id",
    "attendance" = CASE WHEN ar."is_present" THEN 'present' ELSE 'absent' END
FROM "class_sessions" cs
WHERE cs."class_id" = ar."class_id"
  AND cs."date" = date_trunc('day', ar."date");
--> statement-breakpoint

-- Nothing should be left unmatched, since the sessions were derived from these
-- same rows. Removing any stragglers keeps the NOT NULL below safe.
DELETE FROM "attendance_records" WHERE "session_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "attendance_records" ALTER COLUMN "session_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_class_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- A student can only be marked once per session. This is what lets the roll
-- call be a single upsert instead of a query-per-student loop.
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_session_student_unique" UNIQUE("session_id","student_id");
--> statement-breakpoint

ALTER TABLE "attendance_records" DROP COLUMN "class_id";
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "date";
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "is_present";
--> statement-breakpoint

-- Renamed rather than dropped and recreated, so contracts keep their value.
ALTER TABLE "grade_contracts" RENAME COLUMN "required_engagement_intentions" TO "required_participation_sessions";
