import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { can, REGISTRARS } from "../../lib/roles.js";

export default function StudentsLayout() {
  const { lang, t } = useLang();
  const { profile } = useAuth();
  const writer = can(profile, REGISTRARS);
  return (
    <>
      <h1>{t("students.title")}</h1>
      <nav className="tabs" aria-label={t("students.title")}>
        <NavLink end to={`/${lang}/students`}>{t("students.tabs.list")}</NavLink>
        {writer && <NavLink to={`/${lang}/students/new`}>{t("students.tabs.register")}</NavLink>}
        {writer && <NavLink to={`/${lang}/students/import`}>{t("students.tabs.import")}</NavLink>}
        {writer && <NavLink to={`/${lang}/students/allocation`}>{t("students.tabs.allocation")}</NavLink>}
      </nav>
      <Outlet />
    </>
  );
}
