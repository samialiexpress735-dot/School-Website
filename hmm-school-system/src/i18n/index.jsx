import { createContext, useContext, useEffect, useMemo } from "react";
import en from "./en.js";
import am from "./am.js";

export const LANGS = ["en", "am"];
export const DEFAULT_LANG = "en";
const dictionaries = { en, am };

const LangContext = createContext({ lang: DEFAULT_LANG, t: (k) => k });

function lookup(dict, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
}

export function LangProvider({ lang, children }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${dictionaries[lang].school.name} – ${dictionaries[lang].school.system}`;
  }, [lang]);

  const value = useMemo(() => {
    // t("dashboard.welcome", { name: "Abebe" }) -> text with {name} replaced.
    // If an Amharic key is missing we fall back to English so nothing shows blank.
    const t = (path, vars = {}) => {
      const raw = lookup(dictionaries[lang], path) ?? lookup(dictionaries.en, path) ?? path;
      return typeof raw === "string"
        ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`))
        : raw;
    };
    return { lang, t };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
