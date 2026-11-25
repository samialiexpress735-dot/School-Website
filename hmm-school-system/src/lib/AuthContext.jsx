import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, isConfigured } from "./supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isConfigured);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, full_name_am, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data ?? null);
    setProfileLoaded(true);
  }, []);

  // Quietly re-read the signed-in person's profile (name, role, active) so that a change made by the
  // administration shows without signing out and in again. A failed read never changes anything.
  const refreshProfile = useCallback(async (userId) => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, full_name_am, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return;
    setProfile((old) => (old && JSON.stringify(old) === JSON.stringify(data) ? old : data));
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!isConfigured || !userId) return undefined;
    const onVisible = () => { if (document.visibilityState === "visible") refreshProfile(userId); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [session?.user?.id, refreshProfile]);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user) setProfileLoaded(false);
      // defer so we never call Supabase inside the auth callback itself
      setTimeout(() => loadProfile(next?.user?.id), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ session, profile, loading: loading || (Boolean(session) && !profileLoaded), signIn, signOut, refreshProfile: () => refreshProfile(session?.user?.id) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
