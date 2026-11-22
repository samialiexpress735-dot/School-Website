import { useEffect, useState } from "react";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery } from "../../lib/ui.jsx";
import { loadMarksReference, defaultSemesterId } from "../../lib/marksData.js";

// Years, semesters, grades, streams, subjects and settings shared by the marks screens.
export function useMarksRef() {
  const { profile } = useAuth();
  return useQuery(() => loadMarksReference(profile?.id), [profile?.id]);
}

// Year and semester pickers. Picks the current year and the semester that includes today.
export function useYearSemester(refData) {
  const [yearId, setYearId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  useEffect(() => {
    if (!refData || yearId) return;
    const y = refData.years.find((x) => x.is_current) || refData.years[0];
    if (y) {
      setYearId(y.id);
      setSemesterId(defaultSemesterId(refData.semesters, y.id));
    }
  }, [refData, yearId]);
  const changeYear = (id) => {
    setYearId(id);
    setSemesterId(defaultSemesterId(refData.semesters, id));
  };
  return { yearId, semesterId, setSemesterId, changeYear };
}

export function YearSemesterPicker({ refData, state, extra }) {
  const { t } = useLang();
  return (
    <div className="toolbar">
      <label>
        <span className="small muted">{t("marks.year")}</span>
        <select value={state.yearId} onChange={(e) => state.changeYear(e.target.value)}>
          {refData.years.map((y) => (
            <option key={y.id} value={y.id}>{y.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="small muted">{t("marks.semester")}</span>
        <select value={state.semesterId} onChange={(e) => state.setSemesterId(e.target.value)}>
          {refData.semesters.filter((s) => s.academic_year_id === state.yearId).map((s) => (
            <option key={s.id} value={s.id}>{t("marks.semesterN", { n: s.number })}</option>
          ))}
        </select>
      </label>
      {extra}
    </div>
  );
}

export const sectionLabel = (section, grades, streams, lang, pickFn) => {
  const g = grades.find((x) => x.id === section.grade_id);
  const st = streams.find((x) => x.id === section.stream_id);
  const stream = st && st.code !== "general" ? ` ${pickFn(st, lang)}` : "";
  return `${pickFn(g, lang)}${stream} · ${section.name}${section.shift === "afternoon" ? " ☾" : ""}`;
};
