-- Step 7A: report card templates (blueprint 4.8.1).
-- The school uploads its own blank report card form and marks where each value goes.
--   report_templates          one row per form (name, kind, the grades and streams it serves)
--   report_template_versions  every saved layout is a NEW row; old versions are never changed or deleted,
--                             so a card printed last year can be reproduced exactly
--   save_report_template_version()  the only way to add a version (checks who, and the shape of the layout)
--   storage bucket report-forms     PRIVATE; the blank form pages, as images made in the browser
-- Run once, after 001-012.

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('semester1', 'semester2', 'yearly')),
  grade_ids uuid[] not null default '{}',   -- the grades this form serves
  stream_ids uuid[] not null default '{}',  -- empty = every stream of those grades
  current_version_id uuid,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.report_templates(id) on delete cascade,
  version_no integer not null check (version_no >= 1),
  layout jsonb not null,
  page_count smallint not null check (page_count between 1 and 2),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (template_id, version_no)
);

alter table public.report_templates
  add constraint report_templates_current_version_fk
  foreign key (current_version_id) references public.report_template_versions(id);

create trigger touch_report_templates before update on public.report_templates
  for each row execute function public.set_updated_at();
create trigger audit_report_templates after insert or update or delete on public.report_templates
  for each row execute function public.write_audit_log();
create trigger audit_report_template_versions after insert or update or delete on public.report_template_versions
  for each row execute function public.write_audit_log();

-- ---------- Security ----------
alter table public.report_templates enable row level security;
alter table public.report_template_versions enable row level security;

-- Everyone with a role can read (they print only what 4.8 already lets them see).
create policy "report_templates read" on public.report_templates for select to authenticated
  using (public.current_user_role() is not null);
create policy "report_template_versions read" on public.report_template_versions for select to authenticated
  using (public.current_user_role() is not null);

-- Only the system admin, director and vice director create and edit templates.
-- There is no delete rule (a form is switched off with is_active) and no write rule on versions at all:
-- versions are added by the function below and can never be changed afterwards.
create policy "report_templates insert" on public.report_templates for insert to authenticated
  with check (public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]));
create policy "report_templates update" on public.report_templates for update to authenticated
  using (public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]))
  with check (public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]));

-- ---------- Save a new version of a layout ----------
-- layout = { version: 1, offsetMm: {x, y}, pages: [{path, w, h}], columns: [...], rows: [...], fields: [...] }
-- All positions are percentages of the page (0 to 100), so they do not depend on the size of the scan.
create or replace function public.save_report_template_version(p_template uuid, p_layout jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t record; pg jsonb; it jsonb; arr text; n int; v_id uuid; v_no int;
begin
  if not public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  select * into t from public.report_templates where id = p_template;
  if t.id is null then raise exception 'Template not found'; end if;

  if p_layout is null or jsonb_typeof(p_layout) <> 'object' then raise exception 'The layout is not valid'; end if;
  if length(p_layout::text) > 200000 then raise exception 'The layout is too large'; end if;
  if (p_layout->>'version') is distinct from '1' then raise exception 'Unknown layout version'; end if;
  if jsonb_typeof(p_layout->'pages') <> 'array' or jsonb_array_length(p_layout->'pages') not between 1 and 2 then
    raise exception 'A form has one or two pages';
  end if;

  -- every page is an image kept under this template's own folder of the private bucket
  for pg in select * from jsonb_array_elements(p_layout->'pages') loop
    if jsonb_typeof(pg->'path') <> 'string' or (pg->>'path') not like (p_template::text || '/%') or (pg->>'path') like '%..%' then
      raise exception 'A page image is not stored with this template';
    end if;
  end loop;

  -- columns, rows and fields: lists of objects whose positions are numbers from -5 to 105 (percent of the page)
  foreach arr in array array['columns', 'rows', 'fields'] loop
    if p_layout->arr is null then continue; end if;
    if jsonb_typeof(p_layout->arr) <> 'array' then raise exception 'The layout is not valid'; end if;
    n := jsonb_array_length(p_layout->arr);
    if n > 80 then raise exception 'Too many % in the layout', arr; end if;
    for it in select * from jsonb_array_elements(p_layout->arr) loop
      if jsonb_typeof(it) <> 'object' then raise exception 'The layout is not valid'; end if;
      if exists (
        select 1 from jsonb_each(it) e
        where e.key in ('x', 'y', 'w', 'h')
          and (jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric not between -5 and 105)
      ) then raise exception 'A position in the layout is outside the page'; end if;
      if (it->>'page') is not null and (it->>'page') not in ('0', '1') then raise exception 'The layout is not valid'; end if;
      if (it->>'page') = '1' and jsonb_array_length(p_layout->'pages') < 2 then raise exception 'The layout is not valid'; end if;
    end loop;
  end loop;

  select coalesce(max(version_no), 0) + 1 into v_no from public.report_template_versions where template_id = p_template;
  insert into public.report_template_versions (template_id, version_no, layout, page_count)
  values (p_template, v_no, p_layout, jsonb_array_length(p_layout->'pages'))
  returning id into v_id;
  update public.report_templates set current_version_id = v_id where id = p_template;
  return v_id;
end $$;

grant execute on function public.save_report_template_version(uuid, jsonb) to authenticated;

-- ---------- Private storage for the blank forms ----------
-- Images only (the browser turns a PDF into one image per page). The bucket is NOT public:
-- people read a form through a short-lived signed link, and only roles with a login can ask for one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-forms', 'report-forms', false, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png'];

create policy "report forms read" on storage.objects for select to authenticated
  using (bucket_id = 'report-forms' and public.current_user_role() is not null);
create policy "report forms insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-forms' and public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]));
-- No update or delete rule: a page image of an old version must stay as it was.
