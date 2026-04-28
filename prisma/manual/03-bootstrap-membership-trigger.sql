-- ─────────────────────────────────────────────────────────────────────────
-- Bootstrap membership trigger
--
-- The first time someone in the apphero allowlist signs in via magic link,
-- this trigger automatically creates their OWNER membership in the
-- "york-planning" workspace. Without it, they'd authenticate but see no
-- workspaces and be stuck on a workspace switcher with zero options.
--
-- Add more allowlist emails to OWNER_ALLOWLIST or admin/member tiers as
-- the team grows. For invited clients, prefer the in-app invitation UI
-- (still TODO) over hard-coding here.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bootstrap_user_membership()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Hard-coded allowlist for the first wave. Anyone NOT in this list
  -- still gets a Supabase auth.users row (so they can be invited later
  -- by an admin), but no workspace membership is auto-created — they'll
  -- see an empty state on first sign-in.
  owner_emails text[] := ARRAY['jerome@apphero.tech'];
  york_id uuid;
BEGIN
  IF NEW.email = ANY(owner_emails) THEN
    SELECT id INTO york_id FROM "Workspace" WHERE slug = 'york-planning' LIMIT 1;
    IF york_id IS NOT NULL THEN
      INSERT INTO "Membership" ("id", "userId", "workspaceId", "role", "createdAt")
      VALUES (gen_random_uuid(), NEW.id, york_id, 'OWNER', NOW())
      ON CONFLICT ("userId", "workspaceId") DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_bootstrap ON auth.users;

CREATE TRIGGER on_auth_user_created_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_user_membership();
