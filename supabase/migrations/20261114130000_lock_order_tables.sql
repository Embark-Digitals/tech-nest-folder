-- Applied to the live database on 2026-11-14 (via the Lovable query tool, no agent).
-- Lovable ignores migrations pushed through Git; this file is the record.
--
-- Supabase default grants gave anon (signed-out visitors) full table rights on the
-- two admin-only order tables. RLS already returned no rows, but TRUNCATE is not
-- covered by RLS, so remove anything anon does not need. Staff keep normal
-- read/write through RLS.
REVOKE ALL ON public.order_item_costs FROM anon;
REVOKE ALL ON public.order_fulfilment FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.order_item_costs FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.order_fulfilment FROM authenticated;
