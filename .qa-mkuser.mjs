import { createClient } from '@supabase/supabase-js';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `technest.qa+${Date.now()}@example.invalid`;
const password = crypto.randomUUID() + 'Aa1!';
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'QA Tester' } });
if (error) { console.error('ERR', error.message); process.exit(1); }
const pub = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: s, error: e2 } = await pub.auth.signInWithPassword({ email, password });
if (e2) { console.error('ERR2', e2.message); process.exit(1); }
const fs = await import('fs');
fs.writeFileSync('/tmp/browser/tn/session.json', JSON.stringify(s.session));
fs.writeFileSync('/tmp/browser/tn/userid.txt', data.user.id);
console.log('created user', data.user.id, 'session ok');
