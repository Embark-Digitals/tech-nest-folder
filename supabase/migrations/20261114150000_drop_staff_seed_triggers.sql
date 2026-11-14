-- Applied to the live database on 2026-11-14 (via the Lovable query tool, no agent).
-- Lovable ignores migrations pushed through Git; this file is the record.
--
-- SEC-001A: migration 20260731141944 auto-granted admin roles to three hard-coded
-- email addresses on sign-up/confirmation. All three accounts already hold their
-- roles, so the triggers only remained as a latent escalation path (e.g. if a
-- listed mail domain lapsed). Staff are now added through Admin -> Team only.
-- The function is kept (unused) so this can be reversed by recreating the triggers.
DROP TRIGGER IF EXISTS on_auth_user_created_seed_staff ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_confirmed_seed_staff ON auth.users;
REVOKE ALL ON FUNCTION public.grant_seeded_staff_roles() FROM PUBLIC, anon, authenticated;
