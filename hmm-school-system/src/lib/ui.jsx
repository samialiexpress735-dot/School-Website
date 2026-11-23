import { useEffect, useRef, useState, useCallback } from "react";
import { useLang } from "../i18n/index.jsx";
import { changedIds } from "./rowflash.js";

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
// A "Saved." message fades away by itself after a few seconds; errors stay until cleared.
export function useNotice() {
  const { t } = useLang();
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const ok = useCallback(() => {
    clearTimeout(timer.current);
    setNotice({ type: "ok", text: t("common.saved") });
    timer.current = setTimeout(() => setNotice(null), 5000);
  }, [t]);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setNotice(null);
  }, []);
  const fail = useCallback(
    (err, custom) => {
      clearTimeout(timer.current);
      setNotice({ type: "error", text: custom || t("common.saveFailed", { detail: err?.message || "" }), dismiss });
    },
    [t, dismiss]
  );
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setNotice(null);
  }, []);
  return { notice, ok, fail, clear, setNotice };
}

export function Notice({ notice }) {
  if (!notice) return null;
  return (
    <p className={notice.type === "ok" ? "flash ok" : "flash error"} role={notice.type === "ok" ? "status" : "alert"}>
      <span>{notice.text}</span>
      {notice.type === "error" && notice.dismiss && <DismissButton onClick={notice.dismiss} />}
    </p>
  );
}

// A small "x" that closes an error message (errors stay until the person closes them).
function DismissButton({ onClick }) {
  const { t } = useLang();
  return (
    <button type="button" className="flash-close" onClick={onClick} aria-label={t("common.dismiss")}>
      <span aria-hidden="true">×</span>
    </button>
  );
}

// Highlights, for a moment, the rows that were added or changed since the list was last loaded.
//   const flash = useRowFlash(list, scopeKey);   <tr className={flash(row.id)}>
// The first load never flashes, and neither does a change of scopeKey (for example another year in a filter).
export function useRowFlash(rows, scopeKey = "") {
  const prev = useRef(null);
  const scope = useRef(scopeKey);
  const timer = useRef(null);
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!Array.isArray(rows)) return;
    if (scope.current !== scopeKey) {
      scope.current = scopeKey;
      prev.current = null;
    }
    const { ids: changed, next } = changedIds(prev.current, rows);
    prev.current = next;
    if (changed.size) {
      setIds(changed);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setIds(new Set()), 2000);
    }
  }, [rows, scopeKey]);
  return (id) => (ids.has(id) ? "just-saved" : "");
}

// Calm placeholder bars shown while data loads (replaces a plain "Loading…" line).
export function Loading() {
  const { t } = useLang();
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="sk-line w60" />
      <div className="sk-line" />
      <div className="sk-line w80" />
    </div>
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

// "First Father Grandfather", in Amharic when the page is Amharic and the Amharic names exist.
export function fullName(row, lang) {
  if (!row) return "";
  const am = [row.first_name_am, row.father_name_am, row.grandfather_name_am].filter(Boolean).join(" ");
  const en = [row.first_name, row.father_name, row.grandfather_name].filter(Boolean).join(" ");
  return lang === "am" && am ? am : en;
}
