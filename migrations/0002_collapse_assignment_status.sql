-- Collapse assignment_progress.status from the old 0-3 scale to the three
-- states an instructor can actually record.
--
-- Old scheme (the names did not match the labels the UI rendered):
--   0 NOT_STARTED  -> displayed "Not Submitted"
--   1 IN_PROGRESS  -> displayed "Not Submitted"  (unreachable from the UI)
--   2 COMPLETED    -> displayed "Work-in-Progress"
--   3 EXCELLENT    -> displayed "Successfully Completed"
--
-- New scheme (shared/constants.ts):
--   0 MISSING
--   1 WORK_IN_PROGRESS
--   2 COMPLETE
--
-- Every row keeps the meaning it displayed with. A single CASE is used rather
-- than a sequence of UPDATEs because 3 -> 2 and 2 -> 1 overlap: run as separate
-- statements in the wrong order, completed work would be demoted to
-- work-in-progress. Rows with a NULL status are left alone.

UPDATE "assignment_progress"
SET "status" = CASE "status"
  WHEN 0 THEN 0
  WHEN 1 THEN 0
  WHEN 2 THEN 1
  WHEN 3 THEN 2
  ELSE "status"
END
WHERE "status" IS NOT NULL;
--> statement-breakpoint

-- The same remap for status values recorded inside audit_logs.
--
-- Grade history is rendered through the shared status labels, so leaving these
-- on the old scale would misreport past changes: a row recorded as 3 under the
-- old scheme would render as "Not Submitted" under the new one -- telling a
-- student their completed work had been marked missing.
--
-- Only assignment_progress entries carry a status, and only numeric values are
-- touched, so nulls and any other shape are left alone.

UPDATE "audit_logs"
SET "new_values" = jsonb_set(
  "new_values"::jsonb,
  '{status}',
  to_jsonb(
    CASE ("new_values" ->> 'status')::int
      WHEN 0 THEN 0
      WHEN 1 THEN 0
      WHEN 2 THEN 1
      WHEN 3 THEN 2
      ELSE ("new_values" ->> 'status')::int
    END
  )
)::json
WHERE "entity_type" = 'assignment_progress'
  AND "new_values" IS NOT NULL
  AND jsonb_typeof("new_values"::jsonb -> 'status') = 'number';
--> statement-breakpoint

UPDATE "audit_logs"
SET "old_values" = jsonb_set(
  "old_values"::jsonb,
  '{status}',
  to_jsonb(
    CASE ("old_values" ->> 'status')::int
      WHEN 0 THEN 0
      WHEN 1 THEN 0
      WHEN 2 THEN 1
      WHEN 3 THEN 2
      ELSE ("old_values" ->> 'status')::int
    END
  )
)::json
WHERE "entity_type" = 'assignment_progress'
  AND "old_values" IS NOT NULL
  AND jsonb_typeof("old_values"::jsonb -> 'status') = 'number';
