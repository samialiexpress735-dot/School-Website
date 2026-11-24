import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { can, PROMOTION_DECIDERS } from "../../lib/roles.js";

export default function ReportsLayout() {
  const { lang, t } = useLang();
  const { profile } = useAuth();
  return (
    <>
      <h1 className="no-print">{t("reports.title")}</h1>
      <nav className="tabs" aria-label={t("reports.title")}>
        <NavLink end to={`/${lang}/reports`}>{t("reports.tabs.roster")}</NavLink>
        <NavLink to={`/${lang}/reports/cards`}>{t("reports.tabs.cards")}</NavLink>
        <NavLink to={`/${lang}/reports/sheets`}>{t("reports.tabs.sheets")}</NavLink>
        {can(profile, PROMOTION_DECIDERS) && <NavLink to={`/${lang}/reports/promotion`}>{t("reports.tabs.promotion")}</NavLink>}
        {can(profile, PROMOTION_DECIDERS) && <NavLink to={`/${lang}/reports/templates`}>{t("reports.tabs.templates")}</NavLink>}
      </nav>
      <Outlet />
    </>
  );
}
