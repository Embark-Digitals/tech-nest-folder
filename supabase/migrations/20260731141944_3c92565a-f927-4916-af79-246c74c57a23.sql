CREATE OR REPLACE FUNCTION public.grant_seeded_staff_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target public.app_role;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
  target := CASE lower(NEW.email)
    WHEN 'ndumisoyedwa@gmail.com' THEN 'super_admin'::public.app_role
    WHEN 'mchuene10@gmail.com' THEN 'admin'::public.app_role
    WHEN 'contact@embarkdigitals.com' THEN 'admin'::public.app_role
    ELSE NULL END;
  IF target IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, target)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_staff ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_seeded_staff_roles();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_seed_staff ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_seed_staff
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_seeded_staff_roles();

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, CASE lower(u.email)
    WHEN 'ndumisoyedwa@gmail.com' THEN 'super_admin'::public.app_role
    ELSE 'admin'::public.app_role END
FROM auth.users u
WHERE u.email_confirmed_at IS NOT NULL
  AND lower(u.email) IN ('ndumisoyedwa@gmail.com','mchuene10@gmail.com','contact@embarkdigitals.com')
ON CONFLICT (user_id, role) DO NOTHING;

REVOKE ALL ON FUNCTION public.grant_seeded_staff_roles() FROM anon, authenticated;