import { Link, useLocation } from "react-router-dom";
import { useLang } from "../i18n/index.jsx";
import { breadcrumbParts, crumbKeys } from "../lib/nav.js";

// "Dashboard > Students > Register student": shows where you are and gives a way back.
export default function Breadcrumbs() {
  const { lang, t } = useLang();
  const { pathname } = useLocation();
  const parts = breadcrumbParts(pathname);
  if (!parts) return null;
  const keys = crumbKeys(parts);
  const moduleLabel = t(keys.module);
  const tabLabel = keys.tab ? t(keys.tab) : null;
  const showTab = Boolean(tabLabel) && tabLabel !== moduleLabel; // "Staff > Staff" would only repeat itself
  return (
    <nav className="breadcrumb" aria-label={t("nav.breadcrumb")}>
      <ol>
        <li><Link to={`/${lang}/dashboard`}>{t("nav.dashboard")}</Link></li>
        <li>
          {showTab ? <Link to={`/${lang}/${parts.module}`}>{moduleLabel}</Link> : <span aria-current="page">{moduleLabel}</span>}
        </li>
        {showTab && (
          <li><span aria-current="page">{tabLabel}</span></li>
        )}
      </ol>
    </nav>
  );
}
