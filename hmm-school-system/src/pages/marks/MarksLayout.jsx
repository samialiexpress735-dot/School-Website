import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { can, MARK_STRUCTURE_EDITORS } from "../../lib/roles.js";

export default function MarksLayout() {
  const { lang, t } = useLang();
  const { profile } = useAuth();
  const setter = can(profile, MARK_STRUCTURE_EDITORS);
  return (
    <>
      <h1>{t("marks.title")}</h1>
      <nav className="tabs" aria-label={t("marks.title")}>
        <NavLink end to={`/${lang}/marks`}>{t("marks.tabs.entry")}</NavLink>
        <NavLink to={`/${lang}/marks/results`}>{t("marks.tabs.results")}</NavLink>
        {setter && <NavLink to={`/${lang}/marks/structures`}>{t("marks.tabs.structures")}</NavLink>}
      </nav>
      <Outlet />
    </>
  );
}
