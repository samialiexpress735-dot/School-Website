import { useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { PubLangProvider, usePub, LANGS, DEFAULT_LANG } from "./i18n.jsx";
import { HomePage, AboutPage, AcademicsPage, AdmissionsPage, ContactPage } from "./pages.jsx";

const NAV = ["home", "about", "academics", "admissions", "contact"];

function Layout({ children }) {
  const { t, lang } = usePub();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const other = lang === "en" ? "am" : "en";
  const switchTo = pathname.replace(/^\/(en|am)/, `/${other}`);
  const mark = lang === "am" ? "ሀ" : "H";

  return (
    <div className="pub">
      <a className="pub-skip" href="#content">{t("nav.skip")}</a>
      <header className="pub-header">
        <div className="pub-bar">
          <Link className="pub-brand" to={`/${lang}/home`}>
            <span className="pub-mark" aria-hidden="true">{mark}</span>
            <span className="pub-brand-text">
              <strong>{t("site.name")}</strong>
              <small>{t("site.tagline")}</small>
            </span>
          </Link>
          <button type="button" className="pub-menu-btn" aria-expanded={open} aria-controls="pub-nav" onClick={() => setOpen((o) => !o)}>
            {t("nav.menu")}
          </button>
          <nav id="pub-nav" className={`pub-nav${open ? " open" : ""}`} aria-label="Main">
            {NAV.map((k) => (
              <NavLink key={k} to={`/${lang}/${k}`} onClick={() => setOpen(false)}>{t(`nav.${k}`)}</NavLink>
            ))}
            <Link className="pub-lang" to={switchTo} lang={other} onClick={() => setOpen(false)}>{t("nav.lang")}</Link>
          </nav>
        </div>
      </header>
      <main id="content" className="pub-main" key={lang}>{children}</main>
      <footer className="pub-footer">
        <p>© {t("footer.rights")}</p>
      </footer>
    </div>
  );
}

function LangRoutes() {
  const { lang } = useParams();
  if (!LANGS.includes(lang)) return <Navigate to={`/${DEFAULT_LANG}/home`} replace />;
  return (
    <PubLangProvider lang={lang}>
      <Layout>
        <Routes>
          <Route path="home" element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="academics" element={<AcademicsPage />} />
          <Route path="admissions" element={<AdmissionsPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="*" element={<Navigate to={`/${lang}/home`} replace />} />
        </Routes>
      </Layout>
    </PubLangProvider>
  );
}

export default function PublicApp() {
  return (
    <Routes>
      <Route path="/:lang/*" element={<LangRoutes />} />
      <Route path="*" element={<Navigate to={`/${DEFAULT_LANG}/home`} replace />} />
    </Routes>
  );
}
