import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { isConfigured } from "../lib/supabase.js";
import { useLang } from "../i18n/index.jsx";
import LangSwitch from "../components/LangSwitch.jsx";

export default function LoginPage() {
  const { lang, t } = useLang();
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to={`/${lang}/dashboard`} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(err.status === 400 ? t("login.invalid") : t("login.failed"));
    } catch {
      setError(t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-side" aria-label={t("school.name")}>
        <div className="login-side-inner">
          <p className="login-city">{t("school.city")}</p>
          <h1 className="login-school">{t("school.name")}</h1>
          <p className="login-system">{t("school.system")}</p>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-topbar">
          <LangSwitch />
        </div>

        {!isConfigured ? (
          <div className="notice" role="alert">
            <h2>{t("config.title")}</h2>
            <p>{t("config.body")}</p>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <h2>{t("login.title")}</h2>
            <p className="muted">{t("login.intro")}</p>

            <label htmlFor="email">{t("login.email")}</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />

            <label htmlFor="password">{t("login.password")}</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn" disabled={busy || !email || !password}>
              {busy ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
