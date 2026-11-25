import { createContext, useContext, useEffect, useMemo } from "react";
import { en, am } from "./texts.js";

export const LANGS = ["en", "am"];
export const DEFAULT_LANG = "en";

export const dictionaries = { en, am };
const lookup = (dict, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
const Ctx = createContext({ lang: DEFAULT_LANG, t: (k) => k });

export function PubLangProvider({ lang, children }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dictionaries[lang].site.name;
  }, [lang]);
  const value = useMemo(() => {
    const t = (path, vars = {}) => {
      const raw = lookup(dictionaries[lang], path) ?? lookup(dictionaries.en, path) ?? path;
      return typeof raw === "string" ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`)) : raw;
    };
    return { lang, t };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePub = () => useContext(Ctx);
