-- ─────────────────────────────────────────────────────────────────────────
-- Row-Level Security policies for multi-tenant isolation
--
-- Every table that holds workspace-scoped data has RLS enabled. The
-- canonical policy: a row is visible/mutable only if the authenticated
-- user has a membership in that workspace. Reads, inserts, updates and
-- deletes all go through the same `current_user_workspaces()` helper.
--
-- The Postgres role used by the Next.js server differs by call site:
--   • `service_role` key (server-only, in `.env.local`/Vercel) — bypasses
--     RLS. Used for the data-migration script and admin tasks.
--   • `anon` / `authenticated` keys (client-side via `@supabase/ssr`)  —
--     RLS applies; users only see their workspaces.
-- ─────────────────────────────────────────────────────────────────────────

-- Helper — workspace ids the current user is a member of.
CREATE OR REPLACE FUNCTION public.current_user_workspaces()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "workspaceId"
  FROM "Membership"
  WHERE "userId" = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.current_user_workspaces() TO authenticated;

-- ─── Enable RLS + policies on every workspace-scoped table ────────────────

DO $$
DECLARE
  t text;
  workspace_tables text[] := ARRAY[
    'Workspace',
    'Membership',
    'Sprint',
    'TeamMember',
    'Story',
    'PublicHoliday',
    'ProjectHoliday',
    'PtoEntry',
    'InitialCapacity',
    'GuideEntry',
    'SprintStory',
    'Phase'
  ];
BEGIN
  FOREACH t IN ARRAY workspace_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Workspace — visible if user has membership; only OWNER can mutate.
CREATE POLICY "Workspace: members can read"
  ON "Workspace" FOR SELECT
  TO authenticated
  USING ("id" IN (SELECT public.current_user_workspaces()));

CREATE POLICY "Workspace: owners can update"
  ON "Workspace" FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."workspaceId" = "Workspace"."id"
        AND m."userId" = (SELECT auth.uid())
        AND m."role" = 'OWNER'
    )
  );

-- Membership — a user can see their own memberships + memberships of workspaces they belong to.
CREATE POLICY "Membership: read own + workspace peers"
  ON "Membership" FOR SELECT
  TO authenticated
  USING (
    "userId" = (SELECT auth.uid())
    OR "workspaceId" IN (SELECT public.current_user_workspaces())
  );

CREATE POLICY "Membership: owners/admins can mutate"
  ON "Membership" FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."workspaceId" = "Membership"."workspaceId"
        AND m."userId" = (SELECT auth.uid())
        AND m."role" IN ('OWNER', 'ADMIN')
    )
  );

-- Generic policies for every other workspace-scoped table — read & write
-- gated on workspace membership. Roles are enforced in app code, not RLS.
DO $$
DECLARE
  t text;
  data_tables text[] := ARRAY[
    'Sprint',
    'TeamMember',
    'Story',
    'PublicHoliday',
    'ProjectHoliday',
    'PtoEntry',
    'InitialCapacity',
    'GuideEntry',
    'SprintStory',
    'Phase'
  ];
BEGIN
  FOREACH t IN ARRAY data_tables LOOP
    EXECUTE format(
      $f$
      CREATE POLICY %I ON %I FOR SELECT TO authenticated
        USING ("workspaceId" IN (SELECT public.current_user_workspaces()));
      $f$,
      t || ': members can read', t
    );
    EXECUTE format(
      $f$
      CREATE POLICY %I ON %I FOR INSERT TO authenticated
        WITH CHECK ("workspaceId" IN (SELECT public.current_user_workspaces()));
      $f$,
      t || ': members can insert', t
    );
    EXECUTE format(
      $f$
      CREATE POLICY %I ON %I FOR UPDATE TO authenticated
        USING ("workspaceId" IN (SELECT public.current_user_workspaces()))
        WITH CHECK ("workspaceId" IN (SELECT public.current_user_workspaces()));
      $f$,
      t || ': members can update', t
    );
    EXECUTE format(
      $f$
      CREATE POLICY %I ON %I FOR DELETE TO authenticated
        USING ("workspaceId" IN (SELECT public.current_user_workspaces()));
      $f$,
      t || ': members can delete', t
    );
  END LOOP;
END $$;
