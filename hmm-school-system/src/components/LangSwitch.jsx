import { Link, useLocation } from "react-router-dom";
import { useLang } from "../i18n/index.jsx";

// Swaps the /en or /am part of the address and keeps the rest of the page.
// Two looks, one component: the full "English | አማርኛ" pill on wide screens, and on phones (CSS, 640 px or less)
// one small round button that shows the current language as a single letter, E or A. Pressing it switches
// to the other language, and the letter changes with it.
export default function LangSwitch({ onDark = false }) {
  const { lang, t } = useLang();
  const { pathname } = useLocation();
  const rest = pathname.split("/").slice(2).join("/");
  const other = lang === "en" ? "am" : "en";
  const otherName = other === "en" ? "English" : "አማርኛ";
  return (
    <>
      <nav className={`langswitch langswitch-full${onDark ? " on-dark" : ""}`} aria-label={t("common.language")}>
        <Link to={`/en/${rest}`} className={lang === "en" ? "active" : ""} aria-current={lang === "en" ? "true" : undefined} lang="en">
          English
        </Link>
        <Link to={`/am/${rest}`} className={lang === "am" ? "active" : ""} aria-current={lang === "am" ? "true" : undefined} lang="am">
          አማርኛ
        </Link>
      </nav>
      <Link
        to={`/${other}/${rest}`}
        className={`langswitch-short${onDark ? " on-dark" : ""}`}
        lang={other}
        aria-label={`${t("common.language")}: ${otherName}`}
        title={otherName}
      >
        <span aria-hidden="true" lang={lang}>{lang === "am" ? "A" : "E"}</span>
      </Link>
    </>
  );
}
