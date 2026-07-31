DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE order_number = 'TN-1021');
DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE order_number = 'TN-1021');
DELETE FROM public.orders WHERE order_number = 'TN-1021';