import { NavLink, Outlet } from "react-router-dom";
import { useLang } from "../../i18n/index.jsx";

export default function AttendanceLayout() {
  const { lang, t } = useLang();
  return (
    <>
      <h1>{t("attendance.title")}</h1>
      <nav className="tabs" aria-label={t("attendance.title")}>
        <NavLink end to={`/${lang}/attendance`}>{t("attendance.tabs.roll")}</NavLink>
        <NavLink to={`/${lang}/attendance/summary`}>{t("attendance.tabs.summary")}</NavLink>
        <NavLink to={`/${lang}/attendance/flags`}>{t("attendance.tabs.flags")}</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
