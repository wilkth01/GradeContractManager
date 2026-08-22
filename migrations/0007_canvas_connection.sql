ALTER TABLE "classes" ADD COLUMN "canvas_course_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "canvas_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "canvas_token_encrypted" text;