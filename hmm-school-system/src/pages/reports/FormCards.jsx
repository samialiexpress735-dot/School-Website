import { useEffect, useRef, useState } from "react";
import { useLang } from "../../i18n/index.jsx";
import { Loading } from "../../lib/ui.jsx";
import { imagesReady } from "../../lib/formImages.js";
import { buildPrintItems, notFinalList } from "../../lib/reportTemplate.js";
import { pick } from "../../lib/ui.jsx";
import { buildFormCtx, loadAttendance, loadForm, loadHomeroom, loadLocks } from "./formData.js";
import FormSheet from "./FormSheet.jsx";

// Report cards printed on the school's own form: one A4 page (or two) per student.
// `rows` are the students to print. `onReady(print)` hands the parent a function that waits for the page images and prints.
export default function FormCards({ template, rows, refData, year, section, onReady, onFailed }) {
  const { t, lang } = useLang();
  const [state, setState] = useState({ loading: true, data: null });
  const box = useRef(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [form, att, hr, locks] = await Promise.all([loadForm(template.current_version_id), loadAttendance(section.id), loadHomeroom(section.homeroom_staff_id, lang), loadLocks(section.id)]);
      if (!live) return;
      if (form.error || !form.data) { onFailed?.(); return; }
      setState({ loading: false, data: { ...form.data, att, hr, locks } });
    })();
    return () => { live = false; };
  }, [template.current_version_id, section.id, section.homeroom_staff_id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.loading) { onReady?.(null); return; }
    onReady?.(async () => { await imagesReady(box.current); window.print(); });
  }, [state.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) return <Loading />;
  const { layout, urls, att, hr, locks } = state.data;
  // Subjects not finalized for this section leave their boxes blank: say which, so a blank box is never a surprise
  const semIds = refData.semesters.filter((x) => x.academic_year_id === year?.id).sort((p, q) => p.number - q.number).map((x) => x.id);
  const isFinal = (subjectId, n) => Boolean(locks && semIds[n - 1] && locks.has(`${semIds[n - 1]}|${subjectId}`));
  const pending = notFinalList(rows[0]?.results, isFinal, semIds.map((_, i) => i + 1));
  const pendingText = pending.map((p) => `${pick(p.subject, lang)} (${t("marks.semesterN", { n: p.sem })})`).join(", ");
  return (
    <div ref={box} className="form-cards">
      {pending.length > 0 && <p className="flash error no-print" role="status"><span>{t("reports.formUse.notFinal", { list: pendingText })}</span></p>}
      {/* A4 with no browser margin, only while the school's form is on screen */}
      <style>{"@media print { @page { size: A4 portrait; margin: 0; } }"}</style>
      {rows.map((row) => {
        const ctx = buildFormCtx({ row, refData, year, section, lang, t, homeroom: hr, attendance: att, locks });
        const items = buildPrintItems(layout, row, ctx);
        return layout.pages.map((p, i) => (
          <FormSheet key={`${row.enrollment.id}-${i}`} url={urls.get(p.path)} offsetMm={layout.offsetMm} items={items.filter((it) => it.page === i)} className="form-card-page" />
        ));
      })}
    </div>
  );
}
