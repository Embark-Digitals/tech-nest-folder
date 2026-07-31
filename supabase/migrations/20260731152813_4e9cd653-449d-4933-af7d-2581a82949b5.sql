REVOKE ALL ON FUNCTION public.release_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_stock(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.protect_order_fields() FROM PUBLIC, anon, authenticated;