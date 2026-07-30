
-- Triggers for pricing + updated_at
DROP TRIGGER IF EXISTS trg_products_pricing ON public.products;
CREATE TRIGGER trg_products_pricing BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.apply_pricing();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_categories_updated ON public.categories;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_brands_updated ON public.brands;
CREATE TRIGGER trg_brands_updated BEFORE UPDATE ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated ON public.orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_carts_updated ON public.carts;
CREATE TRIGGER trg_carts_updated BEFORE UPDATE ON public.carts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Brands
INSERT INTO public.brands (name, slug) VALUES
 ('Apple','apple'),('Samsung','samsung'),('Dell','dell'),
 ('HP','hp'),('Lenovo','lenovo'),('Logitech','logitech')
ON CONFLICT DO NOTHING;

-- Categories
INSERT INTO public.categories (name, slug, description, sort_order, icon) VALUES
 ('Laptops','laptops','Notebooks and ultrabooks for work, study and play',1,'Laptop'),
 ('Smartphones','smartphones','Latest smartphones with nationwide delivery',2,'Smartphone'),
 ('Audio','audio','Headphones, earbuds and speakers',3,'Headphones'),
 ('Gaming','gaming','Consoles, gaming gear and accessories',4,'Gamepad2'),
 ('Monitors','monitors','Displays for productivity and gaming',5,'Monitor'),
 ('Accessories','accessories','Keyboards, mice, storage and more',6,'Keyboard')
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO public.products (sku, name, slug, brand_id, category_id, short_description, full_description,
  supplier_availability, stock_status, quantity, promotional_price_ex_vat, dealer_price_ex_vat,
  screen_size, capacity, colour, is_featured, is_promotional, is_new_arrival, is_clearance, is_published,
  seo_title, seo_description)
SELECT v.sku, v.name, v.slug,
  (SELECT id FROM public.brands WHERE slug = v.brand),
  (SELECT id FROM public.categories WHERE slug = v.cat),
  v.short_desc, v.full_desc, v.avail::supplier_availability, v.stock::stock_status, v.qty,
  v.price, v.price * 1.05, v.screen, v.capacity, v.colour,
  v.featured, v.promo, v.newin, false, true,
  v.name || ' | TechNest South Africa', v.short_desc
FROM (VALUES
 ('TN-LAP-001','MacBook Air 13" M3','macbook-air-13-m3','apple','laptops','Ultra-thin 13" laptop with the Apple M3 chip and all-day battery.','The MacBook Air 13" with M3 delivers exceptional performance in a fanless design. 8-core CPU, 10-core GPU, 16GB unified memory and a stunning Liquid Retina display.','in_stock','available',12,20999,'13.6"','512GB','Midnight',true,false,true),
 ('TN-LAP-002','Dell XPS 13 Plus','dell-xps-13-plus','dell','laptops','Premium 13" ultrabook with Intel Core Ultra 7 and OLED display.','A striking edge-to-edge keyboard, invisible haptic touchpad and a 13.4" OLED touch display. Intel Core Ultra 7, 16GB RAM, 1TB SSD.','in_stock','available',7,24499,'13.4"','1TB','Platinum',true,true,false),
 ('TN-LAP-003','HP Pavilion 15','hp-pavilion-15','hp','laptops','Everyday 15.6" laptop for study and home office.','Reliable performance with an Intel Core i5, 16GB RAM and 512GB SSD. Full HD display and a full-size keyboard with numeric keypad.','low_stock','low_stock',3,10499,'15.6"','512GB','Silver',false,true,false),
 ('TN-LAP-004','Lenovo ThinkPad E14','lenovo-thinkpad-e14','lenovo','laptops','Business-grade 14" laptop with legendary ThinkPad keyboard.','Built for business with AMD Ryzen 7, 16GB RAM, 512GB SSD, spill-resistant keyboard and a fingerprint reader.','eta','preorder',NULL,13999,'14"','512GB','Black',false,false,true),
 ('TN-PHN-001','iPhone 16 Pro','iphone-16-pro','apple','smartphones','6.3" Pro-grade smartphone with titanium design.','A18 Pro chip, 48MP Fusion camera system, ProMotion display and USB-C. Titanium build with Ceramic Shield front.','in_stock','available',20,22999,'6.3"','256GB','Natural Titanium',true,false,true),
 ('TN-PHN-002','Samsung Galaxy S24 Ultra','samsung-galaxy-s24-ultra','samsung','smartphones','Flagship Galaxy with built-in S Pen and 200MP camera.','6.8" Dynamic AMOLED 2X, Snapdragon 8 Gen 3, 200MP main camera, 5000mAh battery and integrated S Pen.','in_stock','available',9,21499,'6.8"','512GB','Titanium Grey',true,true,false),
 ('TN-PHN-003','Samsung Galaxy A55','samsung-galaxy-a55','samsung','smartphones','Mid-range all-rounder with a big battery.','Super AMOLED 120Hz display, Exynos 1480, 8GB RAM and a 5000mAh battery that lasts all day.','new_in_stock','available',25,7499,'6.6"','256GB','Awesome Navy',false,false,true),
 ('TN-PHN-004','iPhone 15','iphone-15','apple','smartphones','Dynamic Island, 48MP camera and USB-C.','A16 Bionic, 48MP main camera with 2x telephoto, Dynamic Island and a durable colour-infused glass back.','clearance','available',5,14499,'6.1"','128GB','Blue',false,true,false),
 ('TN-AUD-001','AirPods Pro 2 (USB-C)','airpods-pro-2-usb-c','apple','audio','Active noise cancellation earbuds with Adaptive Audio.','Up to 2x more Active Noise Cancellation, Adaptive Audio, Personalised Spatial Audio and a USB-C charging case.','in_stock','available',30,4299,NULL,NULL,'White',true,false,false),
 ('TN-AUD-002','Samsung Galaxy Buds3 Pro','galaxy-buds3-pro','samsung','audio','Hi-Fi earbuds with adaptive ANC.','24-bit Hi-Fi audio, adaptive noise cancelling, blade-style design and seamless Galaxy ecosystem switching.','in_stock','available',18,3899,NULL,NULL,'Silver',false,true,false),
 ('TN-AUD-003','Logitech G Pro X 2 Headset','logitech-g-pro-x-2','logitech','audio','Pro esports wireless gaming headset.','Graphene 50mm drivers, LIGHTSPEED wireless, Bluetooth and detachable Blue VO!CE microphone.','low_stock','low_stock',2,4999,NULL,NULL,'Black',false,false,false),
 ('TN-GAM-001','PlayStation 5 Slim Disc','playstation-5-slim-disc','samsung','gaming','Next-gen console with Ultra HD Blu-ray drive.','Lightning-fast SSD loading, ray tracing, 4K gaming and the DualSense wireless controller with haptic feedback.','in_stock','available',6,12999,NULL,'1TB','White',true,false,false),
 ('TN-GAM-002','Logitech G502 X Mouse','logitech-g502-x','logitech','gaming','Iconic gaming mouse with hybrid optical switches.','HERO 25K sensor, LIGHTFORCE hybrid switches, 13 controls and adjustable weights.','in_stock','available',40,1499,NULL,NULL,'Black',false,true,false),
 ('TN-GAM-003','Logitech G915 TKL Keyboard','logitech-g915-tkl','logitech','gaming','Low-profile wireless mechanical keyboard.','LIGHTSPEED wireless, GL low-profile mechanical switches, LIGHTSYNC RGB and 40-hour battery.','eta','awaiting_confirmation',NULL,3999,NULL,NULL,'Carbon',false,false,true),
 ('TN-MON-001','Dell UltraSharp 27" 4K','dell-ultrasharp-27-4k','dell','monitors','Colour-accurate 27" 4K IPS Black monitor.','IPS Black technology, 2000:1 contrast, 98% DCI-P3, USB-C 90W power delivery and a built-in KVM.','in_stock','available',8,13499,'27"',NULL,'Silver',true,false,false),
 ('TN-MON-002','Samsung Odyssey G5 32"','samsung-odyssey-g5-32','samsung','monitors','Curved 32" QHD 165Hz gaming monitor.','1000R curvature, QHD resolution, 165Hz refresh rate and 1ms response for immersive gaming.','in_stock','available',11,6499,'32"',NULL,'Black',false,true,false),
 ('TN-ACC-001','Logitech MX Keys S','logitech-mx-keys-s','logitech','accessories','Wireless productivity keyboard with smart backlighting.','Perfect-stroke keys, smart illumination, multi-device pairing and USB-C quick charging.','in_stock','available',22,2299,NULL,NULL,'Graphite',false,false,false),
 ('TN-ACC-002','Samsung T7 Shield 2TB SSD','samsung-t7-shield-2tb','samsung','accessories','Rugged portable SSD with 1050MB/s transfers.','IP65 water and dust resistance, drop resistant to 3m, USB 3.2 Gen 2 with up to 1050MB/s read speeds.','in_stock','available',15,3299,NULL,'2TB','Black',false,false,true)
) AS v(sku,name,slug,brand,cat,short_desc,full_desc,avail,stock,qty,price,screen,capacity,colour,featured,promo,newin)
ON CONFLICT (sku) DO NOTHING;

-- Product images
INSERT INTO public.product_images (product_id, url, alt_text, is_primary, sort_order)
SELECT p.id, v.url, p.name, true, 0
FROM (VALUES
 ('TN-LAP-001','https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80'),
 ('TN-LAP-002','https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80'),
 ('TN-LAP-003','https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=900&q=80'),
 ('TN-LAP-004','https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=900&q=80'),
 ('TN-PHN-001','https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=900&q=80'),
 ('TN-PHN-002','https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=900&q=80'),
 ('TN-PHN-003','https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=900&q=80'),
 ('TN-PHN-004','https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80'),
 ('TN-AUD-001','https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=900&q=80'),
 ('TN-AUD-002','https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=900&q=80'),
 ('TN-AUD-003','https://images.unsplash.com/photo-1599669454699-248893623440?w=900&q=80'),
 ('TN-GAM-001','https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=900&q=80'),
 ('TN-GAM-002','https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=900&q=80'),
 ('TN-GAM-003','https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900&q=80'),
 ('TN-MON-001','https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=80'),
 ('TN-MON-002','https://images.unsplash.com/photo-1616763355603-9755a640a287?w=900&q=80'),
 ('TN-ACC-001','https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900&q=80'),
 ('TN-ACC-002','https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=900&q=80')
) AS v(sku,url)
JOIN public.products p ON p.sku = v.sku
WHERE NOT EXISTS (SELECT 1 FROM public.product_images i WHERE i.product_id = p.id);
