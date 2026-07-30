CREATE POLICY "product images staff write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalogue_manager')))
  WITH CHECK (bucket_id = 'product-images' AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'catalogue_manager')));

CREATE POLICY "product images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');