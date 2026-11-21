import { NavLink, Outlet } from "react-router-dom";
import { useLang } from "../../i18n/index.jsx";

export default function StaffLayout() {
  const { lang, t } = useLang();
  return (
    <>
      <h1>{t("staff.title")}</h1>
      <nav className="tabs" aria-label={t("staff.title")}>
        <NavLink end to={`/${lang}/staff`}>{t("staff.tabs.list")}</NavLink>
        <NavLink to={`/${lang}/staff/assignments`}>{t("staff.tabs.assignments")}</NavLink>
        <NavLink to={`/${lang}/staff/departments`}>{t("staff.tabs.departments")}</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
