CREATE POLICY "admins update supplier files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'supplier-catalogues' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'supplier-catalogues' AND public.is_admin(auth.uid()));