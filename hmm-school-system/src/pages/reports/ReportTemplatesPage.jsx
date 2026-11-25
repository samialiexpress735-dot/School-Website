import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, Loading, LoadError, pick } from "../../lib/ui.jsx";
import { can, PROMOTION_DECIDERS } from "../../lib/roles.js";
import { TEMPLATE_KINDS } from "../../lib/reportTemplate.js";
import { useMarksRef } from "../marks/MarksParts.jsx";
import { useConfirm } from "../../components/Dialogs.jsx";
import { deleteTemplateFiles } from "../../lib/formImages.js";

// Reports > School forms: the list of the school's own report card forms, and a small form to start a new one.
// Only the administration sees this tab (the database enforces it too, see 013).
export default function ReportTemplatesPage() {
  const { profile } = useAuth();
  const refQ = useMarksRef();
  if (!can(profile, PROMOTION_DECIDERS)) return null;
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <List refData={refQ.data} />;
}

function List({ refData }) {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const notice = useNotice();
  const q = useQuery(async () => {
    const tpl = await supabase.from("report_templates").select("*").order("created_at", { ascending: false });
    if (tpl.error) return tpl;
    const ids = tpl.data.map((x) => x.current_version_id).filter(Boolean);
    const ver = ids.length ? await supabase.from("report_template_versions").select("id,version_no").in("id", ids) : { data: [] };
    if (ver.error) return ver;
    const no = new Map(ver.data.map((v) => [v.id, v.version_no]));
    return { data: tpl.data.map((x) => ({ ...x, version_no: no.get(x.current_version_id) ?? null })), error: null };
  }, []);

  const gradeNames = (ids) => refData.grades.filter((g) => ids.includes(g.id)).map((g) => pick(g, lang)).join(", ");
  const streamNames = (ids) => refData.streams.filter((s) => ids.includes(s.id)).map((s) => pick(s, lang)).join(", ");

  const toggle = async (row) => {
    const { error } = await supabase.from("report_templates").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) notice.fail(error, t("reports.templates.updateFailed"));
    else q.reload?.();
  };

  // Deleting removes the form and all its saved layouts for good, and then its page images. Cards are not stored
  // anywhere (they are printed from the marks), so nothing already printed is affected; a grade whose form was
  // deleted prints on the built-in plain card again. "Switch off" is the gentler choice and is offered in the dialog text.
  const remove = async (row) => {
    notice.clear();
    const ok = await confirm({
      title: t("dialog.deleteForm.title", { name: row.name }),
      body: t("dialog.deleteForm.body"),
      items: [
        row.version_no ? t("dialog.deleteForm.itemVersions", { n: row.version_no }) : t("dialog.deleteForm.itemNoLayout"),
        t("dialog.deleteForm.itemImages"),
        t("dialog.deleteForm.itemFallback"),
      ],
      footer: t("dialog.deleteForm.footer"),
      confirmLabel: t("dialog.deleteForm.confirm"),
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("delete_report_template", { p_template: row.id });
    if (error) return notice.fail(error, t("reports.templates.deleteFailed"));
    const leftover = await deleteTemplateFiles(row.id);
    q.reload?.();
    if (leftover !== 0) notice.fail(null, t("reports.templates.deletedFilesLeft"));
    else notice.setNotice({ type: "ok", text: t("reports.templates.deleted") });
  };

  return (
    <section className="panel">
      <p className="muted">{t("reports.templates.intro")}</p>
      <Notice notice={notice.notice} />
      {!creating && <p><button type="button" onClick={() => setCreating(true)}>{t("reports.templates.new")}</button></p>}
      {creating && (
        <NewForm
          refData={refData}
          onCancel={() => setCreating(false)}
          onCreated={(id) => nav(`/${lang}/reports/templates/${id}`)}
        />
      )}
      {q.loading ? <Loading shape="table" rows={3} /> : q.error ? <LoadError /> : q.data.length === 0 ? (
        <p className="empty">{t("reports.templates.none")}</p>
      ) : (
        <ul className="tpl-list">
          {q.data.map((row) => (
            <li key={row.id} className={row.is_active ? "" : "tpl-off"}>
              <div>
                <strong>{row.name}</strong>
                <div className="small muted">
                  {t(`reports.templates.kinds.${row.kind}`)} · {gradeNames(row.grade_ids) || "—"}
                  {row.stream_ids.length > 0 && ` · ${streamNames(row.stream_ids)}`}
                </div>
                <div className="small">
                  <span className={`pill ${row.version_no ? "info" : "warn"}`}>{row.version_no ? t("reports.templates.version", { n: row.version_no }) : t("reports.templates.noVersion")}</span>{" "}
                  <span className={`pill ${row.is_active ? "ok" : ""}`}>{row.is_active ? t("reports.templates.active") : t("reports.templates.off")}</span>
                </div>
              </div>
              <div className="row-actions">
                <Link className="btn-small" to={`/${lang}/reports/templates/${row.id}`}>{t("reports.templates.open")}</Link>
                <button type="button" className="btn-small secondary" onClick={() => toggle(row)}>{row.is_active ? t("reports.templates.switchOff") : t("reports.templates.switchOn")}</button>
                <button type="button" className="btn-small danger" onClick={() => remove(row)}>{t("reports.templates.delete")}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewForm({ refData, onCancel, onCreated }) {
  const { t, lang } = useLang();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("yearly");
  const [gradeIds, setGradeIds] = useState([]);
  const [streamIds, setStreamIds] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const streams = refData.streams.filter((s) => s.code !== "general");
  const flip = (list, set, id) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError(t("reports.templates.needName"));
    if (gradeIds.length === 0) return setError(t("reports.templates.needGrade"));
    setBusy(true); setError("");
    const { data, error: err } = await supabase
      .from("report_templates")
      .insert({ name: name.trim(), kind, grade_ids: gradeIds, stream_ids: streamIds })
      .select("id")
      .single();
    setBusy(false);
    if (err) return setError(t("reports.templates.createFailed"));
    onCreated(data.id);
  };

  return (
    <form className="formgrid" onSubmit={submit} noValidate>
      <label className="span2">
        <span>{t("reports.templates.name")}</span>
        <input value={name} maxLength={120} placeholder={t("reports.templates.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span>{t("reports.templates.kind")}</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {TEMPLATE_KINDS.map((k) => (<option key={k} value={k}>{t(`reports.templates.kinds.${k}`)}</option>))}
        </select>
      </label>
      <fieldset className="span2">
        <legend>{t("reports.templates.grades")}</legend>
        <div className="checks">
          {refData.grades.map((g) => (
            <label key={g.id} className="check"><input type="checkbox" checked={gradeIds.includes(g.id)} onChange={() => flip(gradeIds, setGradeIds, g.id)} /> {pick(g, lang)}</label>
          ))}
        </div>
      </fieldset>
      {streams.length > 0 && (
        <fieldset className="span2">
          <legend>{t("reports.templates.streams")}</legend>
          <div className="checks">
            {streams.map((s) => (
              <label key={s.id} className="check"><input type="checkbox" checked={streamIds.includes(s.id)} onChange={() => flip(streamIds, setStreamIds, s.id)} /> {pick(s, lang)}</label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="field-error span2" role="alert">{error}</p>}
      <div className="formgrid-action span2">
        <button type="submit" disabled={busy}>{t("reports.templates.create")}</button>
        <button type="button" className="secondary" onClick={onCancel}>{t("reports.templates.cancel")}</button>
      </div>
    </form>
  );
}
