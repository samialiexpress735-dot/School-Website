import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";
import { useQuery } from "../lib/ui.jsx";
import { formatEc } from "../lib/ethiopian.js";
import { visibleModules, breadcrumbParts, crumbKeys } from "../lib/nav.js";
import { emptyStateFor, shortcutsFor, tilesFor } from "../lib/dashboard.js";
import { loadDashboardStats } from "../lib/dashboardData.js";
import { loadRecent } from "../lib/recent.js";
import NavIcon from "../components/NavIcon.jsx";

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

const ADMINS = ["system_admin", "director", "vice_director"];

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { session, profile } = useAuth();
  const today = todayLabels(lang);
  const name = (lang === "am" ? profile?.full_name_am : profile?.full_name) || profile?.full_name || session?.user?.email;
  const statsQ = useQuery(() => loadDashboardStats(profile), [profile?.id, profile?.role]);
  const stats = statsQ.data;
  const empty = emptyStateFor(profile.role, stats);
  const tiles = stats ? tilesFor(profile.role, stats) : [];
  const shortcuts = shortcutsFor(profile.role);
  const modules = visibleModules(profile.role).filter((m) => m.key !== "dashboard");

  // Last pages opened in this browser, shown as "Students > Register student".
  const recent = useMemo(() => {
    return loadRecent(profile.id)
      .map((e) => {
        const parts = breadcrumbParts(`/x/${e.path}`);
        if (!parts || !modules.some((m) => m.key === parts.module)) return null;
        return { path: e.path, parts };
      })
      .filter(Boolean)
      .slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, profile.role]);
  const crumbText = (parts) => {
    const k = crumbKeys(parts);
    const m = t(k.module);
    const tab = k.tab ? t(k.tab) : null;
    return tab && tab !== m ? `${m} › ${tab}` : m;
  };

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

      {empty ? (
        <EmptyState kind={empty} admin={ADMINS.includes(profile.role)} />
      ) : (
        <>
          <h2 className="section-title">{t("dashboard.tilesTitle")}</h2>
          {statsQ.loading ? (
            <ul className="stats" aria-hidden="true">
              {[0, 1, 2].map((i) => (<li key={i} className="stat skeleton" />))}
            </ul>
          ) : (
            tiles.length > 0 && (
              <ul className="stats">
                {tiles.map((x, i) => (
                  <li key={x.key} style={{ "--i": i }}>
                    <Link className="stat" to={`/${lang}/${x.to}`}>
                      <strong>{x.value}</strong>
                      <span>{t(`dashboard.tiles.${x.key}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </>
      )}

      {shortcuts.length > 0 && (
        <>
          <h2 className="section-title">{t("dashboard.todoTitle")}</h2>
          <ul className="shortcuts">
            {shortcuts.map((s, i) => (
              <li key={s.key} style={{ "--i": i }}>
                <Link to={`/${lang}/${s.to}`}>
                  <span className="shortcut-icon"><NavIcon name={s.icon} /></span>
                  <span>
                    <strong>{t(`dashboard.shortcuts.${s.key}.name`)}</strong>
                    <small>{t(`dashboard.shortcuts.${s.key}.desc`)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="section-title">{t("dashboard.recentTitle")}</h2>
          <ul className="recent">
            {recent.map((r) => (
              <li key={r.path}><Link to={`/${lang}/${r.path}`}>{crumbText(r.parts)}</Link></li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section-title">{t("dashboard.modulesTitle")}</h2>
      <ul className="modules">
        {modules.map((m, i) => (
          <li key={m.key} className="module" style={{ "--i": i }}>
            <div>
              <h3><Link to={`/${lang}/${m.key}`}>{t(`dashboard.modules.${m.key}.name`)}</Link></h3>
              <p>{t(`dashboard.modules.${m.key}.desc`)}</p>
            </div>
            <Link className="badge ready" to={`/${lang}/${m.key}`}>{t("dashboard.open")}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// A friendly empty state: what is missing, why, and one clear next step (only for people who can do it).
function EmptyState({ kind, admin }) {
  const { lang, t } = useLang();
  const e = (k) => t(`dashboard.empty.${k}`);
  const body = kind === "noYear" && !admin ? e("noYearOther") : e(`${kind}Body`);
  const action = kind === "noYear" ? (admin ? { to: "structure/years", label: e("noYearAction") } : null) : kind === "noStudents" ? { to: "students/new", label: e("noStudentsAction") } : null;
  return (
    <section className="empty-state" role="status">
      <h2>{e(`${kind}Title`)}</h2>
      <p>{body}</p>
      {action && <Link className="btn" to={`/${lang}/${action.to}`}>{action.label}</Link>}
    </section>
  );
}
