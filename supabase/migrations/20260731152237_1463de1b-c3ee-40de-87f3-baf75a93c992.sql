DROP POLICY IF EXISTS "status history insert" ON public.order_status_history;
CREATE POLICY "status history staff insert" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));