UPDATE public.product_images
SET url = 'https://jkfbnwgphrdidshxjajp.supabase.co/storage/v1/object/public/product-images/' || url
WHERE url NOT LIKE 'http%';