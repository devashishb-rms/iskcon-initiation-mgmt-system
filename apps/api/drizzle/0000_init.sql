CREATE TYPE "public"."application_status" AS ENUM('OPEN', 'DECLINED', 'WITHDRAWN', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."ceremony_status" AS ENUM('PLANNED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('IN_APP', 'EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."recommendation_decision" AS ENUM('APPROVE', 'SEND_BACK', 'DECLINE');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('SHELTER_ACCEPTANCE', 'EXAM_RESULT', 'COURSE_CERTIFICATE', 'ESSAY', 'OATH', 'BIO_DATA', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('PASSED', 'FAILED', 'NOT_TAKEN');--> statement-breakpoint
CREATE TYPE "public"."guru_response" AS ENUM('ACCEPTED', 'WAIT', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('PREVIEWED', 'COMMITTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('MONTHLY', 'READINESS', 'MESSAGE', 'SEND_BACK');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'READ');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('CANDIDATE', 'MENTOR', 'PRESIDENT', 'COMMITTEE', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."rule_version_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('ASPIRING', 'SHELTER', 'PREPARING', 'APPLIED', 'RECOMMENDED', 'INITIATED');--> statement-breakpoint
CREATE TYPE "public"."track" AS ENUM('FIRST', 'SECOND');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" bigint NOT NULL,
	"subscriber" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_event_id_subscriber_pk" PRIMARY KEY("event_id","subscriber")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"destination" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"totp_secret_sealed" text,
	"totp_enabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "users_tenant_email_uq" UNIQUE("tenant_id","email"),
	CONSTRAINT "users_tenant_phone_uq" UNIQUE("tenant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "gurus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gurus_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "gurus_tenant_name_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "rule_set_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "rule_version_status" NOT NULL,
	"params" jsonb NOT NULL,
	"note" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "rule_set_versions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "rule_set_versions_set_version_uq" UNIQUE("rule_set_id","version")
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guru_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_sets_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "rule_sets_tenant_guru_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","guru_id")
);
--> statement-breakpoint
CREATE TABLE "application_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"from_stage" "stage",
	"to_stage" "stage" NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"track" "track" NOT NULL,
	"stage" "stage" DEFAULT 'ASPIRING' NOT NULL,
	"stage_since" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "application_status" DEFAULT 'OPEN' NOT NULL,
	"guru_id" uuid,
	"practice_since" date,
	"shelter_date" date,
	"exam_status" "exam_status",
	"course_complete" boolean,
	"first_initiation_date" date,
	"guru_changed_on" date,
	"returned_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "applications_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"group_name" text,
	"mentor_id" uuid,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "candidates_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "note_kind" NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "documents_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "guru_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"response" "guru_response" NOT NULL,
	"reason" text,
	"recorded_by_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"missing_documents" jsonb NOT NULL,
	"exported_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"decision" "recommendation_decision" NOT NULL,
	"reason" text,
	"decided_by_id" uuid NOT NULL,
	"rule_set_version_id" uuid NOT NULL,
	"evaluation_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_exceptions_app_rule_uq" UNIQUE("application_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "ceremonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guru_id" uuid NOT NULL,
	"track" "track" NOT NULL,
	"venue" text NOT NULL,
	"date" date NOT NULL,
	"status" "ceremony_status" DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ceremonies_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ceremony_attendees" (
	"tenant_id" uuid NOT NULL,
	"ceremony_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"present" boolean DEFAULT false NOT NULL,
	"spiritual_name" text,
	CONSTRAINT "ceremony_attendees_ceremony_id_application_id_pk" PRIMARY KEY("ceremony_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "register_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_name" text NOT NULL,
	"spiritual_name" text NOT NULL,
	"track" "track" NOT NULL,
	"guru_id" uuid NOT NULL,
	"ceremony_id" uuid NOT NULL,
	"initiated_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "register_entries_applicationId_unique" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"application_id" uuid,
	"rule_set_version_id" uuid,
	"detail" jsonb,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_dedupe_uq" UNIQUE("tenant_id","dedupe_key","channel")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"status" "import_status" NOT NULL,
	"rows" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gurus" ADD CONSTRAINT "gurus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_tenant_id_rule_set_id_rule_sets_tenant_id_id_fk" FOREIGN KEY ("tenant_id","rule_set_id") REFERENCES "public"."rule_sets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_tenant_id_guru_id_gurus_tenant_id_id_fk" FOREIGN KEY ("tenant_id","guru_id") REFERENCES "public"."gurus"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_events" ADD CONSTRAINT "application_stage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_events" ADD CONSTRAINT "application_stage_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_events" ADD CONSTRAINT "application_stage_events_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_candidate_id_candidates_tenant_id_id_fk" FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "public"."candidates"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_guru_id_gurus_tenant_id_id_fk" FOREIGN KEY ("tenant_id","guru_id") REFERENCES "public"."gurus"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_responses" ADD CONSTRAINT "guru_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_responses" ADD CONSTRAINT "guru_responses_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_responses" ADD CONSTRAINT "guru_responses_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_exports" ADD CONSTRAINT "package_exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_exports" ADD CONSTRAINT "package_exports_exported_by_id_users_id_fk" FOREIGN KEY ("exported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_exports" ADD CONSTRAINT "package_exports_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_tenant_id_rule_set_version_id_rule_set_versions_tenant_id_id_fk" FOREIGN KEY ("tenant_id","rule_set_version_id") REFERENCES "public"."rule_set_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_exceptions" ADD CONSTRAINT "rule_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_exceptions" ADD CONSTRAINT "rule_exceptions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_exceptions" ADD CONSTRAINT "rule_exceptions_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceremonies" ADD CONSTRAINT "ceremonies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceremonies" ADD CONSTRAINT "ceremonies_tenant_id_guru_id_gurus_tenant_id_id_fk" FOREIGN KEY ("tenant_id","guru_id") REFERENCES "public"."gurus"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceremony_attendees" ADD CONSTRAINT "ceremony_attendees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceremony_attendees" ADD CONSTRAINT "ceremony_attendees_tenant_id_ceremony_id_ceremonies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","ceremony_id") REFERENCES "public"."ceremonies"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ceremony_attendees" ADD CONSTRAINT "ceremony_attendees_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_tenant_id_application_id_applications_tenant_id_id_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_tenant_id_guru_id_gurus_tenant_id_id_fk" FOREIGN KEY ("tenant_id","guru_id") REFERENCES "public"."gurus"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_entries" ADD CONSTRAINT "register_entries_tenant_id_ceremony_id_ceremonies_tenant_id_id_fk" FOREIGN KEY ("tenant_id","ceremony_id") REFERENCES "public"."ceremonies"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "otp_user_created_idx" ON "otp_challenges" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "user_roles_tenant_role_idx" ON "user_roles" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "rule_set_versions_lookup_idx" ON "rule_set_versions" USING btree ("tenant_id","rule_set_id","status");--> statement-breakpoint
CREATE INDEX "stage_events_app_idx" ON "application_stage_events" USING btree ("tenant_id","application_id","at");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("tenant_id","stage","status");--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "applications_guru_idx" ON "applications" USING btree ("tenant_id","guru_id");--> statement-breakpoint
CREATE INDEX "candidates_mentor_idx" ON "candidates" USING btree ("tenant_id","mentor_id");--> statement-breakpoint
CREATE INDEX "candidates_name_idx" ON "candidates" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "notes_app_idx" ON "notes" USING btree ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_app_idx" ON "documents" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "guru_responses_app_idx" ON "guru_responses" USING btree ("tenant_id","application_id","recorded_at");--> statement-breakpoint
CREATE INDEX "package_exports_app_idx" ON "package_exports" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "recommendations_app_idx" ON "recommendations" USING btree ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "rule_exceptions_app_idx" ON "rule_exceptions" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "ceremonies_date_idx" ON "ceremonies" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "ceremony_attendees_app_idx" ON "ceremony_attendees" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "register_initiated_idx" ON "register_entries" USING btree ("tenant_id","initiated_on");--> statement-breakpoint
CREATE INDEX "register_guru_idx" ON "register_entries" USING btree ("tenant_id","guru_id");--> statement-breakpoint
CREATE INDEX "audit_app_idx" ON "audit_log" USING btree ("tenant_id","application_id","at");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("status","channel");--> statement-breakpoint
CREATE INDEX "import_jobs_idx" ON "import_jobs" USING btree ("tenant_id","created_at");