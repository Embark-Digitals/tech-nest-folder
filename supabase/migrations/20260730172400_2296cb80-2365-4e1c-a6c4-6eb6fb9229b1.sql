UPDATE public.products
SET is_published = true
WHERE is_published = false
  AND pricing_review_required = false
  AND selling_price_incl_vat IS NOT NULL;