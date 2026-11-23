import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";
import { formatEc } from "../lib/ethiopian.js";

// "to" turns a module into a link once its step is built.
const MODULES = [
  { key: "structure", step: 2, to: "structure" },
  { key: "staff", step: 3, to: "staff" },
  { key: "students", step: 4, to: "students" },
  { key: "marks", step: 5, to: "marks" },
  { key: "attendance", step: 6, to: "attendance" },
  { key: "reports", step: 7, to: "reports" },
];

// Today in both calendars, for the welcome banner. The standard date is shown in the page language.
function todayLabels(lang) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let gc = iso;
  try {
    gc = now.toLocaleDateString(lang === "am" ? "am-ET" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    /* keep the plain date */
  }
  return { ec: formatEc(iso, lang), gc };
}

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { session, profile } = useAuth();
  const today = todayLabels(lang);
  const name = (lang === "am" ? profile?.full_name_am : profile?.full_name) || profile?.full_name || session?.user?.email;

  return (
    <>
      <section className="hero" aria-labelledby="welcome">
        <h1 id="welcome">{t("dashboard.welcome", { name })}</h1>
        <p>{t("dashboard.role", { role: t(`roles.${profile.role}`) })}</p>
        <p className="hero-date">
          <span>{today.ec}</span>
          <span>{today.gc}</span>
        </p>
      </section>

      <h2 className="section-title">{t("dashboard.modulesTitle")}</h2>
      <ul className="modules">
        {MODULES.map((m, i) => (
          <li key={m.key} className="module" style={{ "--i": i }}>
            <div>
              <h3>{m.to ? <Link to={`/${lang}/${m.to}`}>{t(`dashboard.modules.${m.key}.name`)}</Link> : t(`dashboard.modules.${m.key}.name`)}</h3>
              <p>{t(`dashboard.modules.${m.key}.desc`)}</p>
            </div>
            {m.to ? (
              <Link className="badge ready" to={`/${lang}/${m.to}`}>
                {t("dashboard.open")}
              </Link>
            ) : (
              <span className="badge">{t("dashboard.soon", { n: m.step })}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
