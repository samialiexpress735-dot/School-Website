import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";
import LangSwitch from "./LangSwitch.jsx";

export default function Shell({ children, showNav }) {
  const { lang, t } = useLang();
  const { signOut } = useAuth();
  // The page fades in when the screen changes. The language part of the address is left out of the key,
  // so switching language does not reset a form that is half filled in.
  const { pathname } = useLocation();
  const pageKey = pathname.split("/").slice(2).join("/");
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-name">
          <strong>{t("school.name")}</strong>
          <span>{t("school.system")}</span>
        </div>
        <div className="topbar-actions">
          <LangSwitch onDark />
          <button type="button" className="btn-ghost" onClick={signOut}>
            {t("common.signOut")}
          </button>
        </div>
      </header>
      {showNav && (
        <nav className="mainnav" aria-label="Main">
          <NavLink to={`/${lang}/dashboard`}>{t("nav.dashboard")}</NavLink>
          <NavLink to={`/${lang}/structure`}>{t("nav.structure")}</NavLink>
          <NavLink to={`/${lang}/staff`}>{t("nav.staff")}</NavLink>
          <NavLink to={`/${lang}/students`}>{t("nav.students")}</NavLink>
        </nav>
      )}
      <main className="content page-enter" key={pageKey}>
        {children}
      </main>
    </div>
  );
}
