import { useLang } from "../i18n/index.jsx";
import { formatEc } from "../lib/ethiopian.js";

export default function EcDate({ value }) {
  const { lang } = useLang();
  if (!value) return null;
  return <span className="ec">{formatEc(value, lang)}</span>;
}
