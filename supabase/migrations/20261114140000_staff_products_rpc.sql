-- Applied to the live database on 2026-11-14 (via the Lovable query tool, no agent).
-- Lovable ignores migrations pushed through Git; this file is the record.
--
-- SEC-001A step 1 of 2: staff screens read full product rows (including Atlas
-- cost prices) through this staff-only function, so that ordinary signed-in
-- customers can later lose access to the cost columns (step 2).
CREATE OR REPLACE FUNCTION public.staff_products()
RETURNS SETOF public.products
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.products;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_products() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_products() FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_products() TO authenticated;
