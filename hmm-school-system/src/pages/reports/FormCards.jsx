import { useEffect, useRef, useState } from "react";
import { useLang } from "../../i18n/index.jsx";
import { Loading } from "../../lib/ui.jsx";
import { imagesReady } from "../../lib/formImages.js";
import { buildPrintItems } from "../../lib/reportTemplate.js";
import { buildFormCtx, loadAttendance, loadForm, loadHomeroom } from "./formData.js";
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
      const [form, att, hr] = await Promise.all([loadForm(template.current_version_id), loadAttendance(section.id), loadHomeroom(section.homeroom_staff_id, lang)]);
      if (!live) return;
      if (form.error || !form.data) { onFailed?.(); return; }
      setState({ loading: false, data: { ...form.data, att, hr } });
    })();
    return () => { live = false; };
  }, [template.current_version_id, section.id, section.homeroom_staff_id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.loading) { onReady?.(null); return; }
    onReady?.(async () => { await imagesReady(box.current); window.print(); });
  }, [state.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading) return <Loading />;
  const { layout, urls, att, hr } = state.data;
  return (
    <div ref={box} className="form-cards">
      {/* A4 with no browser margin, only while the school's form is on screen */}
      <style>{"@media print { @page { size: A4 portrait; margin: 0; } }"}</style>
      {rows.map((row) => {
        const ctx = buildFormCtx({ row, refData, year, section, lang, t, homeroom: hr, attendance: att });
        const items = buildPrintItems(layout, row, ctx);
        return layout.pages.map((p, i) => (
          <FormSheet key={`${row.enrollment.id}-${i}`} url={urls.get(p.path)} offsetMm={layout.offsetMm} items={items.filter((it) => it.page === i)} className="form-card-page" />
        ));
      })}
    </div>
  );
}
