import { NavLink, Outlet } from "react-router-dom";
import { useLang } from "../../i18n/index.jsx";

const TABS = ["years", "calendar", "subjects", "sections"];

export default function StructureLayout() {
  const { lang, t } = useLang();
  return (
    <>
      <h1>{t("structure.title")}</h1>
      <nav className="tabs" aria-label={t("structure.title")}>
        {TABS.map((tab) => (
          <NavLink key={tab} to={`/${lang}/structure/${tab}`}>
            {t(`structure.tabs.${tab}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
