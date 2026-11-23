import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { fetchAll, fmt } from "../../lib/marksData.js";
import { loadReport } from "../../lib/reportsData.js";
import { needsStream, suggestDecision } from "../../lib/reports.js";
import { useMarksRef } from "../marks/MarksParts.jsx";
import { useConfirm } from "../../components/Dialogs.jsx";

export default function PromotionPage() {
  const refQ = useMarksRef();
  const { t } = useLang();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  if (refQ.data.years.length < 2) return <p className="empty">{t("reports.promo.needTwoYears")}</p>;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t, lang } = useLang();
  const years = refData.years; // newest first
  const current = years.find((y) => y.is_current) || years[0];
  const [fromId, setFromId] = useState(current.id);
  const nextOf = (id) => {
    const y = years.find((x) => x.id === id);
    const later = years.filter((x) => x.year_ec > y.year_ec && !x.is_closed).sort((a, b) => a.year_ec - b.year_ec);
    return later[0]?.id || "";
  };
  const [toId, setToId] = useState(nextOf(current.id));
  const [gradeId, setGradeId] = useState(refData.grades[0]?.id || "");
  const from = years.find((y) => y.id === fromId);
  const targets = years.filter((y) => y.year_ec > from.year_ec && !y.is_closed);

  const gsQ = useQuery(() => fetchAll(() => supabase.from("grade_subjects").select("*").eq("academic_year_id", fromId)), [fromId]);
  const changeFrom = (id) => {
    setFromId(id);
    setToId(nextOf(id));
  };
  return (
    <section className="panel">
      <p className="muted">{t("reports.promo.intro", { pass: fmt(refData.passMark) })}</p>
      <div className="toolbar">
        <label>
          <span className="small muted">{t("reports.promo.from")}</span>
          <select value={fromId} onChange={(e) => changeFrom(e.target.value)}>
            {years.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
          </select>
        </label>
        <label>
          <span className="small muted">{t("reports.promo.to")}</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            {targets.length === 0 && <option value="">—</option>}
            {targets.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
          </select>
        </label>
        <label>
          <span className="small muted">{t("marks.grade")}</span>
          <select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            {refData.grades.map((g) => (<option key={g.id} value={g.id}>{pick(g, lang)}</option>))}
          </select>
        </label>
      </div>
      {!toId ? <p className="empty">{t("reports.promo.noTarget")}</p> : gsQ.loading ? <Loading /> : gsQ.error ? <LoadError /> : (
        <Decisions key={`${fromId}|${toId}|${gradeId}`} refData={refData} fromId={fromId} toId={toId} gradeId={gradeId} gradeSubjects={gsQ.data} />
      )}
    </section>
  );
}

function Decisions({ refData, fromId, toId, gradeId, gradeSubjects }) {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const { notice, ok, fail, setNotice } = useNotice();
  const gradeNumber = refData.grades.find((g) => g.id === gradeId)?.number;
  const q = useQuery(() => loadReport({ refData, gradeSubjects, yearId: fromId, gradeId, withDecisions: true }), [fromId, gradeId]);
  const [choice, setChoice] = useState({}); // enrollmentId -> { decision, streamId }
  const [saving, setSaving] = useState(false);
  const streamChoices = refData.streams.filter((s) => s.code !== "general");

  const rows = useMemo(() => {
    if (!q.data) return [];
    const all = q.data.groups.flatMap((g) => g.report.rows);
    return all
      .map((r) => ({ ...r, decided: q.data.decisions.get(r.enrollment.id) || null, suggestion: suggestDecision({ overall: r.overall, complete: r.complete, gradeNumber, passMark: refData.passMark }) }))
      .sort((a, b) => (a.enrollment.sections?.name || "~").localeCompare(b.enrollment.sections?.name || "~") || fullName(a.enrollment.students, "en").localeCompare(fullName(b.enrollment.students, "en")));
  }, [q.data, gradeNumber, refData.passMark]);

  // start every undecided student with the suggested decision
  useEffect(() => {
    const init = {};
    rows.forEach((r) => {
      if (!r.decided && r.suggestion) init[r.enrollment.id] = { decision: r.suggestion, streamId: "" };
    });
    setChoice(init);
  }, [rows]);

  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  if (rows.length === 0) return <p className="empty">{t("marks.results.noStudents")}</p>;

  const set = (id, patch) => setChoice((c) => ({ ...c, [id]: { ...(c[id] || { decision: "", streamId: "" }), ...patch } }));
  const options = gradeNumber >= 12 ? ["graduate", "repeat"] : ["promote", "repeat"];
  const pending = rows.filter((r) => !r.decided && choice[r.enrollment.id]?.decision);
  const missingStream = pending.filter((r) => needsStream(choice[r.enrollment.id].decision, gradeNumber) && !choice[r.enrollment.id].streamId);
  const counts = { promote: 0, repeat: 0, graduate: 0 };
  pending.forEach((r) => (counts[choice[r.enrollment.id].decision] += 1));
  const toYear = refData.years.find((y) => y.id === toId);

  const setAllStreams = (streamId) => {
    setChoice((c) => {
      const next = { ...c };
      rows.forEach((r) => {
        const x = next[r.enrollment.id];
        if (x && needsStream(x.decision, gradeNumber)) next[r.enrollment.id] = { ...x, streamId };
      });
      return next;
    });
  };

  const save = async () => {
    if (missingStream.length) return fail(null, t("reports.promo.needStream", { n: missingStream.length }));
    const vars = { n: pending.length, year: toYear?.label, promote: counts.promote, repeat: counts.repeat, graduate: counts.graduate };
    if (!(await confirm({ title: t("dialog.promotion.title", vars), body: t("dialog.promotion.body", vars), confirmLabel: t("dialog.promotion.confirm") }))) return;
    setSaving(true);
    setNotice(null);
    const items = pending.map((r) => ({
      enrollment_id: r.enrollment.id,
      decision: choice[r.enrollment.id].decision,
      stream_id: choice[r.enrollment.id].streamId || null,
    }));
    const { error } = await supabase.rpc("apply_promotions", { p_from_year: fromId, p_to_year: toId, p_items: items });
    setSaving(false);
    if (error) return fail(error);
    ok();
    q.reload();
  };

  return (
    <>
      <div className="toolbar">
        {gradeNumber === 10 && (
          <label>
            <span className="small muted">{t("reports.promo.streamAll")}</span>
            <select defaultValue="" onChange={(e) => setAllStreams(e.target.value)}>
              <option value="">—</option>
              {streamChoices.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
            </select>
          </label>
        )}
      </div>
      <Notice notice={notice} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{t("marks.student")}</th>
              <th>{t("marks.section")}</th>
              <th className="center">{t("marks.results.overall")}</th>
              <th>{t("reports.promo.suggested")}</th>
              <th>{t("reports.promo.decision")}</th>
              {gradeNumber === 10 && <th>{t("marks.stream")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = r.enrollment.id;
              const c = choice[id] || { decision: "", streamId: "" };
              return (
                <tr key={id}>
                  <td>{fullName(r.enrollment.students, lang)}</td>
                  <td>{r.enrollment.sections?.name || "—"}</td>
                  <td className="center" style={r.complete ? undefined : { fontStyle: "italic" }}>{r.overall === null ? "—" : fmt(r.overall, refData.yearlyPlaces)}</td>
                  <td>{r.suggestion ? t(`reports.promo.decisions.${r.suggestion}`) : <span className="pill warn">{t("marks.incomplete")}</span>}</td>
                  <td>
                    {r.decided ? (
                      <span className="pill info">{t(`reports.promo.decisions.${r.decided}`)} ✓</span>
                    ) : (
                      <select value={c.decision} onChange={(e) => set(id, { decision: e.target.value })} aria-label={t("reports.promo.decision")}>
                        <option value="">—</option>
                        {options.map((o) => (<option key={o} value={o}>{t(`reports.promo.decisions.${o}`)}</option>))}
                      </select>
                    )}
                  </td>
                  {gradeNumber === 10 && (
                    <td>
                      {!r.decided && needsStream(c.decision, gradeNumber) ? (
                        <select value={c.streamId} onChange={(e) => set(id, { streamId: e.target.value })} aria-label={t("marks.stream")}>
                          <option value="">—</option>
                          {streamChoices.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
                        </select>
                      ) : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">{t("reports.promo.afterNote")}</p>
      <p>
        <button type="button" onClick={save} disabled={saving || pending.length === 0} aria-busy={saving}>
          {t("reports.promo.approve", { n: pending.length })}
        </button>
      </p>
    </>
  );
}
