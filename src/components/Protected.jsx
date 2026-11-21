import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { useLang } from "../i18n/index.jsx";
import Shell from "./Shell.jsx";
import { Loading } from "../lib/ui.jsx";

// Wraps every page that needs a signed-in user with a role.
export default function Protected({ children }) {
  const { lang, t } = useLang();
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="content"><Loading /></div>;
  if (!session) return <Navigate to={`/${lang}/login`} replace />;

  const hasAccess = Boolean(profile?.role && profile?.is_active);
  if (!hasAccess) {
    return (
      <Shell>
        <div className="notice" role="status">
          <h2>{t("pending.title")}</h2>
          <p>{profile?.role && !profile?.is_active ? t("pending.inactive") : t("pending.body")}</p>
        </div>
      </Shell>
    );
  }
  return <Shell showNav>{children}</Shell>;
}
