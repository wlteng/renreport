-- The existing manager role becomes General Manager and keeps everything it had.
-- A new project-scoped manager role is added; its permissions and policies follow
-- in the next migration, because a new enum value cannot be used in the same
-- transaction that adds it.
ALTER TYPE public.app_role RENAME VALUE 'manager' TO 'general_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager' AFTER 'general_manager';
