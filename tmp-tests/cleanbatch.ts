import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("catalogue_imports").select("id,file_name").in("file_name",["edge-cases.xlsx","catalogue.csv","searchable.pdf"]);
for (const b of data ?? []) { await db.from("catalogue_imports").delete().eq("id", b.id); console.log("removed", b.file_name); }
