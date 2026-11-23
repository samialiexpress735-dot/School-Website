// UI v2, Part C: styled confirmation dialogs (instead of the browser's plain confirm window)
// and the "you have unsaved changes" guard.
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, body, items, confirmLabel, tone: "danger" }))) return;
//
// A dialog names the action, says what will change, and has a primary button worded as the action.
// For a "danger" dialog the focus starts on Cancel, so pressing Enter by mistake does not delete anything.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../i18n/index.jsx";

const DialogContext = createContext({
  // outside the provider (should not happen) fall back to the browser window rather than doing nothing
  confirm: async (o) => window.confirm([o?.title, o?.body].filter(Boolean).join("\n\n")),
  setDirty: () => {},
});

export const useConfirm = () => useContext(DialogContext).confirm;

// useUnsavedChanges(isDirty): while isDirty is true, leaving the page (a link inside the app, closing the tab,
// refreshing) asks first. key lets two forms on one page count separately.
export function useUnsavedChanges(isDirty, key = "form") {
  const { setDirty } = useContext(DialogContext);
  useEffect(() => {
    setDirty(key, Boolean(isDirty));
    return () => setDirty(key, false);
  }, [isDirty, key, setDirty]);
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DialogProvider({ children }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [dlg, setDlg] = useState(null); // { opts, resolve }
  const opener = useRef(null);
  const dirty = useRef(new Set());

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        opener.current = document.activeElement;
        setDlg({ opts, resolve });
      }),
    []
  );
  const setDirty = useCallback((key, on) => {
    if (on) dirty.current.add(key);
    else dirty.current.delete(key);
  }, []);

  const finish = useCallback(
    (result) => {
      setDlg((d) => {
        d?.resolve(result);
        return null;
      });
      const el = opener.current;
      if (el && typeof el.focus === "function" && document.contains(el)) setTimeout(() => el.focus(), 0);
    },
    []
  );

  // Unsaved changes: closing or refreshing the tab, and any link inside the app.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty.current.size) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = async (e) => {
      if (!dirty.current.size || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target?.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.closest(".langswitch")) return; // switching language keeps the form
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("#/")) return;
      e.preventDefault();
      e.stopPropagation();
      const leave = await confirm({
        title: t("dialog.leave.title"),
        body: t("dialog.leave.body"),
        confirmLabel: t("dialog.leave.confirm"),
        cancelLabel: t("dialog.leave.stay"),
        tone: "danger",
      });
      if (leave) {
        dirty.current.clear();
        navigate(href.slice(1));
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [confirm, navigate, t]);

  const value = useMemo(() => ({ confirm, setDirty }), [confirm, setDirty]);
  return (
    <DialogContext.Provider value={value}>
      {children}
      {dlg && <ConfirmDialog opts={dlg.opts} onResult={finish} />}
    </DialogContext.Provider>
  );
}

function ConfirmDialog({ opts, onResult }) {
  const { t } = useLang();
  const danger = opts.tone === "danger";
  const box = useRef(null);
  const cancelBtn = useRef(null);
  const okBtn = useRef(null);
  const uid = useRef(`dlg${Math.random().toString(36).slice(2, 8)}`).current;
  const paragraphs = (Array.isArray(opts.body) ? opts.body : String(opts.body || "").split("\n\n")).filter(Boolean);

  useEffect(() => {
    document.documentElement.classList.add("modal-open");
    (danger ? cancelBtn : okBtn).current?.focus();
    return () => document.documentElement.classList.remove("modal-open");
  }, [danger]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onResult(false);
    } else if (e.key === "Tab") {
      const items = [...box.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onResult(false)}>
      <div
        ref={box}
        className={`dialog${danger ? " danger" : ""}`}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-b`}
        onKeyDown={onKeyDown}
      >
        <h2 id={`${uid}-t`}>{opts.title}</h2>
        <div id={`${uid}-b`} className="dialog-body">
          {paragraphs.map((p, i) => (<p key={i}>{p}</p>))}
          {opts.items?.length > 0 && <ul>{opts.items.map((x, i) => (<li key={i}>{x}</li>))}</ul>}
          {opts.footer && <p>{opts.footer}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" ref={cancelBtn} className="btn-small secondary" onClick={() => onResult(false)}>
            {opts.cancelLabel || t("dialog.cancel")}
          </button>
          <button type="button" ref={okBtn} className={`btn-small${danger ? " danger-solid" : ""}`} onClick={() => onResult(true)}>
            {opts.confirmLabel || t("dialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
