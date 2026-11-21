import { Link, useLocation } from "react-router-dom";
import { useLang } from "../i18n/index.jsx";

// Swaps the /en or /am part of the address and keeps the rest of the page.
export default function LangSwitch({ onDark = false }) {
  const { lang, t } = useLang();
  const { pathname } = useLocation();
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <nav className={`langswitch${onDark ? " on-dark" : ""}`} aria-label={t("common.language")}>
      <Link to={`/en/${rest}`} className={lang === "en" ? "active" : ""} aria-current={lang === "en" ? "true" : undefined} lang="en">
        English
      </Link>
      <Link to={`/am/${rest}`} className={lang === "am" ? "active" : ""} aria-current={lang === "am" ? "true" : undefined} lang="am">
        አማርኛ
      </Link>
    </nav>
  );
}
