import { NavLink, Outlet } from "react-router-dom";
import { useLang } from "../../i18n/index.jsx";
import { useAuth } from "../../lib/AuthContext.jsx";
import { can, STAFF_EDITORS } from "../../lib/roles.js";

export default function StaffLayout() {
  const { lang, t } = useLang();
  const { profile } = useAuth();
  return (
    <>
      <h1>{t("staff.title")}</h1>
      <nav className="tabs" aria-label={t("staff.title")}>
        <NavLink end to={`/${lang}/staff`}>{t("staff.tabs.list")}</NavLink>
        {can(profile, STAFF_EDITORS) && <NavLink to={`/${lang}/staff/import`}>{t("staff.tabs.import")}</NavLink>}
        <NavLink to={`/${lang}/staff/assignments`}>{t("staff.tabs.assignments")}</NavLink>
        <NavLink to={`/${lang}/staff/departments`}>{t("staff.tabs.departments")}</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
