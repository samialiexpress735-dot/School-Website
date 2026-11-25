import { supabase, isConfigured } from "../lib/supabase.js";

// Everything the public site reads or sends goes through these four calls.
// They use only the safe public functions and the announcements table (migration 014).
const need = () => { if (!isConfigured) throw new Error("not-configured"); return supabase; };

export async function getAnnouncements() {
  const { data, error } = await need().from("announcements")
    .select("id,title_en,title_am,body_en,body_am,starts_on,ends_on").order("starts_on", { ascending: false }).limit(5);
  if (error) throw error;
  return data || [];
}
export async function getCalendar() {
  const { data, error } = await need().rpc("public_calendar");
  if (error) throw error;
  return data;
}
export async function getAcademics() {
  const { data, error } = await need().rpc("public_academics");
  if (error) throw error;
  return data;
}
export async function sendApplication(args) {
  const { error } = await need().rpc("submit_application", args);
  if (error) throw error;
}
export async function sendContact(args) {
  const { error } = await need().rpc("submit_contact_message", args);
  if (error) throw error;
}
