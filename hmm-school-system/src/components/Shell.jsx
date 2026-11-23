import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";
import { visibleModules, breadcrumbParts } from "../lib/nav.js";
import { addRecent, isRecentEntry, loadRecent, saveRecent } from "../lib/recent.js";
import { DURATION, reducedMotion } from "../lib/motion.js";
import LangSwitch from "./LangSwitch.jsx";
import NavIcon from "./NavIcon.jsx";
import Breadcrumbs from "./Breadcrumbs.jsx";

export default function Shell({ children, showNav }) {
  const { lang, t } = useLang();
  const { signOut, profile } = useAuth();
  // The page fades in when the screen changes. The language part of the address is left out of the key,
  // so switching language does not reset a form that is half filled in.
  const { pathname } = useLocation();
  const pageKey = pathname.split("/").slice(2).join("/");

  // Language switch: a quick cross-fade of the text. The page is not remounted (a half-filled form stays as it is);
  // a class is added for a moment, and only opacity changes.
  const mainRef = useRef(null);
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) { firstLang.current = false; return undefined; }
    const el = mainRef.current;
    if (!el || reducedMotion()) return undefined;
    el.classList.remove("lang-fade");
    void el.offsetWidth; // restart the animation if the language is switched twice quickly
    el.classList.add("lang-fade");
    const id = setTimeout(() => el.classList.remove("lang-fade"), DURATION.base + 60);
    return () => clearTimeout(id);
  }, [lang]);

  // Phone menu: opens as a drawer; closes on a page change, on Escape and when the dark area is tapped.
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    sidebar.current?.querySelector("a")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Remember the last pages opened (page addresses only, kept in this browser) for the dashboard.
  useEffect(() => {
    if (!showNav || !profile?.id) return;
    const parts = breadcrumbParts(pathname);
    if (!parts || parts.tab === "details") return;
    const path = pathname.split("/").slice(2).filter(Boolean).join("/");
    const entry = { path, module: parts.module, tab: parts.tab };
    if (isRecentEntry(entry)) saveRecent(profile.id, addRecent(loadRecent(profile.id), entry));
  }, [pathname, showNav, profile?.id]);

  const modules = showNav ? visibleModules(profile?.role) : [];
  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t("nav.skip")}</a>
      <header className="topbar">
        <div className="topbar-left">
          {showNav && (
            <button
              type="button"
              ref={menuButton}
              className="menu-btn"
              aria-expanded={open}
              aria-controls="sidebar"
              aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
              onClick={() => setOpen((v) => !v)}
            >
              <span aria-hidden="true" className="menu-bars" />
            </button>
          )}
          <div className="topbar-name">
            <strong>{t("school.name")}</strong>
            <span>{t("school.system")}</span>
          </div>
        </div>
        <div className="topbar-actions">
          <LangSwitch onDark />
          <button type="button" className="btn-ghost" onClick={signOut}>
            {t("common.signOut")}
          </button>
        </div>
      </header>
      <div className={`frame${showNav ? "" : " no-side"}`}>
        {showNav && (
          <>
            <div className={`scrim${open ? " is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
            <aside id="sidebar" ref={sidebar} className={`sidebar${open ? " is-open" : ""}`}>
              <nav aria-label={t("nav.main")}>
                <ul>
                  {modules.map((m) => (
                    <li key={m.key}>
                      <NavLink to={`/${lang}/${m.key}`} end={m.key === "dashboard"}>
                        <NavIcon name={m.key} />
                        <span>{t(`nav.${m.key}`)}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          </>
        )}
        <main id="main" ref={mainRef} tabIndex={-1} className="content page-enter" key={pageKey}>
          {showNav && <Breadcrumbs />}
          {children}
        </main>
      </div>
      <footer className="footer">
        <strong>{t("school.name")}</strong> · {t("school.city")}
      </footer>
    </div>
  );
}
