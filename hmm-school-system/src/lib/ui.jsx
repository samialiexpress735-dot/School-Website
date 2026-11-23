import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useLang } from "../i18n/index.jsx";
import { changedIds } from "./rowflash.js";
import { DURATION, countStep, glideDeltas, reducedMotion } from "./motion.js";

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

// Calm placeholder shown while data loads (replaces a plain "Loading…" line).
// shape: "lines" (default), "table" (a header and rows), "cards" (a grid of cards) or "form" (labels and fields),
// so the placeholder has the same outline as what is about to appear.
export function Loading({ shape = "lines", rows = 5 }) {
  const { t } = useLang();
  return (
    <div className={`skeleton sk-${shape}`} role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      {shape === "table" && (
        <>
          <div className="sk-row sk-head" aria-hidden="true"><span className="sk-line" /><span className="sk-line" /><span className="sk-line" /></div>
          {Array.from({ length: rows }, (_, i) => (
            <div className="sk-row" key={i} aria-hidden="true" style={{ "--i": i }}><span className="sk-line" /><span className="sk-line" /><span className="sk-line" /></div>
          ))}
        </>
      )}
      {shape === "cards" && (
        <div className="sk-grid" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => <div className="sk-card" key={i} style={{ "--i": i }} />)}
        </div>
      )}
      {shape === "form" && (
        <div aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div className="sk-field" key={i}><span className="sk-line w30" /><span className="sk-box" /></div>
          ))}
        </div>
      )}
      {shape === "lines" && (
        <>
          <div className="sk-line w60" />
          <div className="sk-line" />
          <div className="sk-line w80" />
        </>
      )}
    </div>
  );
}

// A number that moves to its new value instead of jumping (marks totals, counts on the allocation board).
// The first value is shown as is. Screen readers get the final value only, never the numbers on the way.
export function CountTo({ value, decimals = 0, format }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = from.current;
    if (!Number.isFinite(start) || !Number.isFinite(value) || start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const t0 = performance.now();
    const tick = () => {
      const p = (performance.now() - t0) / DURATION.slow;
      const v = countStep(start, value, p, decimals);
      from.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, decimals]);
  const text = (v) => (format ? format(v) : String(v));
  return (
    <>
      <span aria-hidden="true">{text(shown)}</span>
      <span className="sr-only">{text(value)}</span>
    </>
  );
}

// Gives a changing value a small "nudge" class for a moment, but only when it really changes (not on first show).
//   <span key={nudge.key} className={nudge.className}>
export function useNudge(value) {
  const prev = useRef(value);
  const n = useRef(0);
  if (prev.current !== value) {
    prev.current = value;
    n.current += 1;
  }
  return { key: n.current, className: n.current > 0 ? "nudge" : "" };
}

// Makes items glide to their new place when a list is rearranged (FLIP): mark each item with data-glide="<id>"
// inside the container. Uses transform only, and does nothing when the person prefers less motion.
export function useGlide(containerRef, signature) {
  const before = useRef(new Map());
  const measure = () => {
    const m = new Map();
    containerRef.current?.querySelectorAll("[data-glide]").forEach((el) => {
      const r = el.getBoundingClientRect();
      m.set(el.getAttribute("data-glide"), { left: r.left, top: r.top });
    });
    return m;
  };
  useLayoutEffect(() => {
    const next = measure();
    if (!reducedMotion() && before.current.size) {
      const deltas = glideDeltas(before.current, next);
      deltas.forEach(({ dx, dy }, id) => {
        const el = containerRef.current?.querySelector(`[data-glide="${CSS.escape(id)}"]`);
        el?.animate?.([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: DURATION.base, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" });
      });
    }
    before.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  // Scrolling or resizing moves everything on screen without a rearrangement; keep the saved positions current
  // so that scrolling is never mistaken for a move (throttled to one measurement per frame).
  useEffect(() => {
    let raf = 0;
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { before.current = measure(); });
    };
    const el = containerRef.current;
    el?.addEventListener("scroll", remeasure, { capture: true, passive: true });
    window.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("scroll", remeasure);
      window.removeEventListener("resize", remeasure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
