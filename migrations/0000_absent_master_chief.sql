CREATE TABLE "assignment_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"assignment_id" integer NOT NULL,
	"status" integer,
	"numeric_grade" numeric(4, 2),
	"attempts" integer DEFAULT 0,
	"last_updated" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"class_id" integer NOT NULL,
	"module_group" text,
	"scoring_type" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"is_present" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"old_values" json,
	"new_values" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"instructor_id" integer NOT NULL,
	"is_archived" boolean DEFAULT false,
	"description" text,
	"semester_start_date" text
);
--> statement-breakpoint
CREATE TABLE "engagement_intentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"intention_text" text NOT NULL,
	"is_fulfilled" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"grade" text NOT NULL,
	"version" integer NOT NULL,
	"assignments" json NOT NULL,
	"required_engagement_intentions" integer DEFAULT 0,
	"max_absences" integer DEFAULT 0,
	"category_requirements" json
);
--> statement-breakpoint
CREATE TABLE "password_reset_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"is_used" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"admin_notified" boolean DEFAULT false,
	CONSTRAINT "password_reset_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"contract_id" integer,
	"is_confirmed" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "student_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"class_id" integer NOT NULL,
	"token" text NOT NULL,
	"is_used" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"role" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"is_temporary" boolean DEFAULT false,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;