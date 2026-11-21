import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key && !url.includes("YOUR-PROJECT"));

// The "anon" key is safe in the browser: access is controlled by the
// Row Level Security rules in supabase/migrations/002_security_policies.sql
export const supabase = isConfigured ? createClient(url, key) : null;
