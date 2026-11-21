import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";

// "to" turns a module into a link once its step is built.
const MODULES = [
  { key: "structure", step: 2, to: "structure" },
  { key: "staff", step: 3, to: "staff" },
  { key: "students", step: 4 },
  { key: "marks", step: 5 },
  { key: "attendance", step: 6 },
  { key: "reports", step: 7 },
];

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { session, profile } = useAuth();
  const name = (lang === "am" ? profile?.full_name_am : profile?.full_name) || profile?.full_name || session?.user?.email;

  return (
    <>
      <h1>{t("dashboard.welcome", { name })}</h1>
      <p className="muted">{t("dashboard.role", { role: t(`roles.${profile.role}`) })}</p>

      <h2 className="section-title">{t("dashboard.modulesTitle")}</h2>
      <ul className="modules">
        {MODULES.map((m) => (
          <li key={m.key} className="module">
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
