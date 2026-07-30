UPDATE public.categories c
SET is_active = false, updated_at = now()
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.category_id = c.id AND p.is_published = true
  );