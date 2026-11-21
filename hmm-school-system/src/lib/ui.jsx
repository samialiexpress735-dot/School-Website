import { useEffect, useState, useCallback } from "react";
import { useLang } from "../i18n/index.jsx";

// Runs a Supabase query and gives back { data, error, loading, reload }.
// fn must return { data, error } like Supabase does.
export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn())
      .then((res) => {
        if (!alive) return;
        setState(res?.error ? { data: null, error: res.error, loading: false } : { data: res?.data ?? null, error: null, loading: false });
      })
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { ...state, reload };
}

// Small "Saved." / error message shown above a form.
export function useNotice() {
  const { t } = useLang();
  const [notice, setNotice] = useState(null);
  const ok = useCallback(() => setNotice({ type: "ok", text: t("common.saved") }), [t]);
  const fail = useCallback(
    (err, custom) => setNotice({ type: "error", text: custom || t("common.saveFailed", { detail: err?.message || "" }) }),
    [t]
  );
  const clear = useCallback(() => setNotice(null), []);
  return { notice, ok, fail, clear, setNotice };
}

export function Notice({ notice }) {
  if (!notice) return null;
  return (
    <p className={notice.type === "ok" ? "flash ok" : "flash error"} role={notice.type === "ok" ? "status" : "alert"}>
      {notice.text}
    </p>
  );
}

export function LoadError() {
  const { t } = useLang();
  return (
    <p className="flash error" role="alert">
      {t("common.loadFailed")}
    </p>
  );
}

// Shows the Amharic name when the page is in Amharic and one exists.
export const pick = (row, lang, field = "name") =>
  (lang === "am" && row?.[`${field}_am`]) || row?.[field] || "";
