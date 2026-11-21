import { Link } from "react-router-dom";
import { useLang } from "../i18n/index.jsx";

export default function NotFoundPage() {
  const { lang, t } = useLang();
  return (
    <main className="center-msg">
      <h1>{t("notFound.title")}</h1>
      <p>
        <Link to={`/${lang}/dashboard`}>{t("notFound.back")}</Link>
      </p>
    </main>
  );
}
