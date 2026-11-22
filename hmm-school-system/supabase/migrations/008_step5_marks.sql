-- =====================================================================
-- Step 5: configurable assessment structures and marks.
-- Run AFTER 001-007. Run it once.
--  1. Replaces the old fixed design (assessment_types) with a flexible one:
--     structure -> groups -> components, per year, SEMESTER, grade, stream, subject
--  2. Marks now point to a component; every mark is checked against its maximum,
--     the student's year, grade and stream, and the lock rules
--  3. Locking of finalized marks per section, subject and semester
--  4. Atomic save and copy functions for structures
--  5. Settings: pass mark and rounding of the yearly average
-- The school has two semesters a year and each semester ends with a final
-- exam, so every structure belongs to ONE semester and carries its own final
-- exam component. Older SQL files are never edited; all changes are made here.
-- =====================================================================

-- ---------- 0. Safety: the old tables must be empty ----------
-- No marks screen existed before Step 5. If someone entered rows by hand,
-- stop here instead of destroying them.
do $$
begin
  if exists (select 1 from public.marks) then
    raise exception 'public.marks already has rows. Step 5 replaces the old assessment design. Export and clear the old marks first.';
  end if;
  if exists (select 1 from public.assessment_types) then
    raise exception 'public.assessment_types already has rows. Step 5 replaces the old assessment design. Export and clear them first.';
  end if;
end $$;

-- ---------- 1. Remove the old fixed design ----------
drop policy if exists "marks read"           on public.marks;
drop policy if exists "marks write admin"    on public.marks;
drop policy if exists "marks teacher insert" on public.marks;
drop policy if exists "marks teacher update" on public.marks;
drop policy if exists "marks lock"           on public.marks;
drop trigger if exists marks_max_check on public.marks;
drop function if exists public.check_mark_not_above_max();
drop function if exists public.semester_locked(uuid);
drop function if exists public.assessment_subject(uuid);

alter table public.marks drop column assessment_type_id;   -- also drops its unique constraint
alter table public.marks drop column is_locked;            -- locking is now per section, subject and semester
drop table public.assessment_types;

-- ---------- 2. The new assessment tables ----------
-- One structure per semester, grade, subject and (optionally) stream.
-- stream_id NULL means "all streams of this grade" (and Grades 9-10, which have no stream).
-- A structure for a specific stream wins over the "all streams" one.
create table public.assessment_structures (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  stream_id uuid references public.streams(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  final_max numeric(6,2) not null default 100 check (final_max > 0),   -- the maximum of the semester result
  rounding_places smallint not null default 0 check (rounding_places between 0 and 2),
  formula text check (formula is null or (length(formula) <= 300 and formula ~ '^[A-Za-z0-9_+*/().,[:space:]-]*$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index assessment_structures_unique on public.assessment_structures (
  semester_id, grade_id,
  coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
  subject_id
);
create index on public.assessment_structures (academic_year_id, grade_id);

-- A group collects components (for example "Continuous assessment" or "Final examination").
-- raw total  = sum of the raw marks of its components
-- converted  = raw total / raw maximum * scale_to        (only when scale_to is set)
-- scaled     = converted * factor
-- contributes to the semester result: the scaled value. No scale_to and factor 1 = added as it is.
create table public.assessment_groups (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.assessment_structures(id) on delete cascade,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{0,15}$' and code <> 'MIN' and code <> 'MAX' and code !~ '_RAW$'),
  name text not null check (length(trim(name)) > 0),
  name_am text,
  scale_to numeric(6,2) check (scale_to is null or scale_to > 0),
  factor numeric(6,3) not null default 1 check (factor > 0),
  sort_order smallint not null default 0,
  unique (structure_id, code),
  unique (id, structure_id)
);

create table public.assessment_components (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.assessment_structures(id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  name_am text,
  raw_max numeric(6,2) not null check (raw_max > 0),
  is_final_exam boolean not null default false,
  sort_order smallint not null default 0,
  foreign key (group_id, structure_id) references public.assessment_groups(id, structure_id) on delete cascade
);
create index on public.assessment_components (structure_id);
create index on public.assessment_components (group_id);

-- Marks now belong to a component.
alter table public.marks
  add column component_id uuid not null references public.assessment_components(id) on delete restrict;
alter table public.marks
  add constraint marks_enrollment_component_unique unique (enrollment_id, component_id);
create index on public.marks (component_id);

-- Finalized marks: one row = "this subject, in this section, in this semester is locked".
create table public.mark_locks (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  locked_by uuid references public.profiles(id),
  locked_at timestamptz not null default now(),
  unique (semester_id, section_id, subject_id)
);

-- ---------- 3. Guards on the structure tables ----------
create or replace function public.guard_structure() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.assessment_structures;
  sem_year uuid; closed boolean; st_code text; g_no smallint;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  select is_closed into closed from public.academic_years where id = r.academic_year_id;
  if closed then raise exception 'This academic year is closed'; end if;
  if tg_op = 'DELETE' then return old; end if;

  select academic_year_id into sem_year from public.semesters where id = new.semester_id;
  if sem_year is distinct from new.academic_year_id then
    raise exception 'The semester does not belong to this academic year';
  end if;

  if new.stream_id is not null then
    select code into st_code from public.streams where id = new.stream_id;
    if st_code = 'general' then new.stream_id := null; end if;   -- "general" means no stream
  end if;
  select number into g_no from public.grades where id = new.grade_id;
  if new.stream_id is not null and g_no <= 10 then
    raise exception 'Grades 9 and 10 do not have a stream';
  end if;

  if tg_op = 'UPDATE' and (
       new.academic_year_id <> old.academic_year_id or new.semester_id <> old.semester_id
       or new.grade_id <> old.grade_id or new.subject_id <> old.subject_id
       or new.stream_id is distinct from old.stream_id) then
    raise exception 'The year, semester, grade, stream and subject of a structure cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger assessment_structures_guard before insert or update or delete on public.assessment_structures
for each row execute function public.guard_structure();

-- Groups and components of a closed year are read-only too.
create or replace function public.guard_structure_children() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid; closed boolean;
begin
  sid := case when tg_op = 'DELETE' then old.structure_id else new.structure_id end;
  select y.is_closed into closed
  from public.assessment_structures s join public.academic_years y on y.id = s.academic_year_id
  where s.id = sid;
  if coalesce(closed, false) then raise exception 'This academic year is closed'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger assessment_groups_guard before insert or update or delete on public.assessment_groups
for each row execute function public.guard_structure_children();
create trigger assessment_components_guard before insert or update or delete on public.assessment_components
for each row execute function public.guard_structure_children();

-- The maximum of an assessment cannot drop below a mark that is already entered.
create or replace function public.guard_component_max() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.raw_max < old.raw_max and exists (
       select 1 from public.marks m where m.component_id = old.id and m.score > new.raw_max) then
    raise exception 'Marks higher than the new maximum are already entered for "%"', old.name;
  end if;
  return new;
end $$;
create trigger assessment_components_max before update of raw_max on public.assessment_components
for each row execute function public.guard_component_max();

-- ---------- 4. Guards on marks ----------
-- Every mark is checked against: the maximum, the student's year, grade and stream,
-- and (for everyone) a closed year. entered_by is always the signed-in user.
create or replace function public.marks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; e record; closed boolean;
begin
  if tg_op = 'DELETE' then
    select y.is_closed into closed
    from public.assessment_components ac
    join public.assessment_structures s on s.id = ac.structure_id
    join public.academic_years y on y.id = s.academic_year_id
    where ac.id = old.component_id;
    if coalesce(closed, false) then raise exception 'This academic year is closed'; end if;
    return old;
  end if;

  select ac.raw_max, s.academic_year_id, s.grade_id, s.stream_id, y.is_closed
    into c
  from public.assessment_components ac
  join public.assessment_structures s on s.id = ac.structure_id
  join public.academic_years y on y.id = s.academic_year_id
  where ac.id = new.component_id;

  select academic_year_id, grade_id, stream_id into e from public.enrollments where id = new.enrollment_id;

  if c.is_closed then raise exception 'This academic year is closed'; end if;

  if tg_op = 'UPDATE' and (new.enrollment_id <> old.enrollment_id or new.component_id <> old.component_id) then
    raise exception 'The student and the assessment of a mark cannot be changed';
  end if;

  if e.academic_year_id is distinct from c.academic_year_id
     or e.grade_id is distinct from c.grade_id
     or (c.stream_id is not null and public.stream_key(e.stream_id) is distinct from c.stream_id) then
    raise exception 'This assessment does not belong to the student''s year, grade and stream';
  end if;

  if new.score > c.raw_max then
    raise exception 'Score % is higher than the maximum % for this assessment', new.score, c.raw_max;
  end if;

  new.entered_by := coalesce(auth.uid(), new.entered_by);
  return new;
end $$;
create trigger marks_guard before insert or update or delete on public.marks
for each row execute function public.marks_guard();

-- Helper: is the subject of this assessment taught to this section by the signed-in teacher
create or replace function public.component_subject(p_component uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.subject_id from public.assessment_components ac
  join public.assessment_structures s on s.id = ac.structure_id
  where ac.id = p_component
$$;

-- Helper: marks may be changed by teachers only while the semester is open
-- and the subject has not been finalized for the student's section.
create or replace function public.marks_open(p_enrollment uuid, p_component uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
           select 1 from public.assessment_components ac
           join public.assessment_structures s on s.id = ac.structure_id
           join public.semesters sm on sm.id = s.semester_id
           where ac.id = p_component and sm.is_locked)
     and not exists (
           select 1 from public.assessment_components ac
           join public.assessment_structures s on s.id = ac.structure_id
           join public.enrollments e on e.id = p_enrollment
           join public.mark_locks l on l.semester_id = s.semester_id
                                   and l.subject_id = s.subject_id
                                   and l.section_id = e.section_id
           where ac.id = p_component)
$$;

-- A lock must match the section's year; locked_by is always the signed-in user.
create or replace function public.mark_locks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
       select 1 from public.sections sec join public.semesters sm on sm.academic_year_id = sec.academic_year_id
       where sec.id = new.section_id and sm.id = new.semester_id) then
    raise exception 'The section and the semester must belong to the same academic year';
  end if;
  new.locked_by := coalesce(auth.uid(), new.locked_by);
  new.locked_at := now();
  return new;
end $$;
create trigger mark_locks_guard before insert on public.mark_locks
for each row execute function public.mark_locks_guard();

-- ---------- 5. Security rules (Row Level Security) ----------
alter table public.assessment_structures enable row level security;
alter table public.assessment_groups     enable row level security;
alter table public.assessment_components enable row level security;
alter table public.mark_locks            enable row level security;

-- Everyone with a role reads the structures; only the administration writes them.
-- (Unit leaders can no longer change them: the structure is set by the system admin, director and vice director.)
do $$
declare t text;
begin
  foreach t in array array['assessment_structures','assessment_groups','assessment_components']
  loop
    execute format($f$create policy "%1$s read" on public.%1$s for select to authenticated
      using (public.current_user_role() is not null)$f$, t);
    execute format($f$create policy "%1$s write" on public.%1$s for all to authenticated
      using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
      with check (public.has_role(array['system_admin','director','vice_director']::app_role[]))$f$, t);
  end loop;
end $$;

-- Marks: read. The administration and unit leaders see everything. The homeroom teacher of a
-- section sees all marks of that section. A subject teacher sees only the marks of the
-- subject they teach in that section (not the marks other teachers entered for other subjects).
create or replace function public.is_homeroom(p_section uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sections s
                 where s.id = p_section and s.homeroom_staff_id = public.my_staff_id())
$$;

create policy "marks read" on public.marks for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[])
         or public.is_homeroom(public.enrollment_section(enrollment_id))
         or public.teaches(public.enrollment_section(enrollment_id), public.component_subject(component_id)));

-- Marks: the system admin can always correct a mark (every change is audited)
create policy "marks write admin" on public.marks for all to authenticated
  using (public.has_role(array['system_admin']::app_role[]))
  with check (public.has_role(array['system_admin']::app_role[]));

-- Marks: a teacher enters, changes and clears marks only for the subject and section
-- they are assigned to, and only while the semester is open and the subject is not finalized.
create policy "marks teacher insert" on public.marks for insert to authenticated
  with check (
    public.has_role(array['teacher','unit_leader']::app_role[])
    and public.marks_open(enrollment_id, component_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.component_subject(component_id))
  );
create policy "marks teacher update" on public.marks for update to authenticated
  using (
    public.has_role(array['teacher','unit_leader']::app_role[])
    and public.marks_open(enrollment_id, component_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.component_subject(component_id))
  )
  with check (
    public.marks_open(enrollment_id, component_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.component_subject(component_id))
  );
create policy "marks teacher delete" on public.marks for delete to authenticated
  using (
    public.has_role(array['teacher','unit_leader']::app_role[])
    and public.marks_open(enrollment_id, component_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.component_subject(component_id))
  );

-- Locks: everyone with a role can see them; the director, vice director, unit leader and
-- system admin can finalize; only the director, vice director and system admin can reopen.
create policy "mark_locks read" on public.mark_locks for select to authenticated
  using (public.current_user_role() is not null);
create policy "mark_locks insert" on public.mark_locks for insert to authenticated
  with check (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[]));
create policy "mark_locks delete" on public.mark_locks for delete to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]));

-- ---------- 6. Save and copy functions ----------
-- Saves a whole structure (settings, groups, components) in one step, or nothing.
-- Rows with an id are updated (so entered marks stay attached); rows without an id are new;
-- rows that are no longer listed are removed (refused when marks already exist for them).
create or replace function public.save_assessment_structure(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := nullif(p->>'id', '')::uuid;
  g jsonb; c jsonb; gid uuid; cid uuid;
  keep_groups uuid[]; keep_comps uuid[];
  gi int := 0; ci int;
  total_out numeric; fmax numeric;
begin
  if not public.has_role(array['system_admin','director','vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  if jsonb_typeof(p->'groups') is distinct from 'array' or jsonb_array_length(p->'groups') = 0 then
    raise exception 'Add at least one group of assessments';
  end if;
  fmax := coalesce(nullif(p->>'final_max', '')::numeric, 100);

  if sid is null then
    insert into public.assessment_structures
      (academic_year_id, semester_id, grade_id, stream_id, subject_id, final_max, rounding_places, formula)
    values (
      (p->>'academic_year_id')::uuid, (p->>'semester_id')::uuid, (p->>'grade_id')::uuid,
      nullif(p->>'stream_id', '')::uuid, (p->>'subject_id')::uuid,
      fmax, coalesce(nullif(p->>'rounding_places', '')::smallint, 0), nullif(trim(coalesce(p->>'formula', '')), ''))
    returning id into sid;
  else
    update public.assessment_structures
       set final_max = fmax,
           rounding_places = coalesce(nullif(p->>'rounding_places', '')::smallint, 0),
           formula = nullif(trim(coalesce(p->>'formula', '')), '')
     where id = sid;
    if not found then raise exception 'Structure not found'; end if;
  end if;

  -- What stays: ids listed in the payload.
  select coalesce(array_agg(nullif(x->>'id', '')::uuid) filter (where nullif(x->>'id', '') is not null), '{}')
    into keep_groups from jsonb_array_elements(p->'groups') x;
  select coalesce(array_agg(nullif(y->>'id', '')::uuid) filter (where nullif(y->>'id', '') is not null), '{}')
    into keep_comps
  from jsonb_array_elements(p->'groups') x, jsonb_array_elements(coalesce(x->'components', '[]'::jsonb)) y;

  -- Remove first, so a new group may reuse the code of a removed one.
  begin
    delete from public.assessment_components where structure_id = sid and not (id = any(keep_comps));
    delete from public.assessment_groups where structure_id = sid and not (id = any(keep_groups));
  exception when foreign_key_violation then
    raise exception 'Marks are already entered for an assessment you removed. Remove those marks first, or keep the assessment.';
  end;

  for g in select * from jsonb_array_elements(p->'groups') loop
    gi := gi + 1;
    if jsonb_typeof(g->'components') is distinct from 'array' or jsonb_array_length(g->'components') = 0 then
      raise exception 'Every group needs at least one assessment';
    end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then
      insert into public.assessment_groups (structure_id, code, name, name_am, scale_to, factor, sort_order)
      values (sid, upper(trim(g->>'code')), trim(g->>'name'), nullif(trim(coalesce(g->>'name_am', '')), ''),
              nullif(g->>'scale_to', '')::numeric, coalesce(nullif(g->>'factor', '')::numeric, 1), gi)
      returning id into gid;
    else
      update public.assessment_groups
         set code = upper(trim(g->>'code')), name = trim(g->>'name'),
             name_am = nullif(trim(coalesce(g->>'name_am', '')), ''),
             scale_to = nullif(g->>'scale_to', '')::numeric,
             factor = coalesce(nullif(g->>'factor', '')::numeric, 1), sort_order = gi
       where id = gid and structure_id = sid;
      if not found then raise exception 'A group does not belong to this structure'; end if;
    end if;

    ci := 0;
    for c in select * from jsonb_array_elements(g->'components') loop
      ci := ci + 1;
      cid := nullif(c->>'id', '')::uuid;
      if cid is null then
        insert into public.assessment_components (structure_id, group_id, name, name_am, raw_max, is_final_exam, sort_order)
        values (sid, gid, trim(c->>'name'), nullif(trim(coalesce(c->>'name_am', '')), ''),
                (c->>'raw_max')::numeric, coalesce((c->>'is_final_exam')::boolean, false), ci);
      else
        update public.assessment_components
           set group_id = gid, name = trim(c->>'name'), name_am = nullif(trim(coalesce(c->>'name_am', '')), ''),
               raw_max = (c->>'raw_max')::numeric, is_final_exam = coalesce((c->>'is_final_exam')::boolean, false),
               sort_order = ci
         where id = cid and structure_id = sid;
        if not found then raise exception 'An assessment does not belong to this structure'; end if;
      end if;
    end loop;
  end loop;

  -- Without a custom formula the groups must add up to the final mark maximum.
  if nullif(trim(coalesce(p->>'formula', '')), '') is null then
    select coalesce(sum(coalesce(g2.scale_to, rt.raw_total) * g2.factor), 0) into total_out
    from public.assessment_groups g2
    join lateral (select sum(raw_max) as raw_total from public.assessment_components k where k.group_id = g2.id) rt on true
    where g2.structure_id = sid;
    if abs(total_out - fmax) > 0.005 then
      raise exception 'The groups add up to % but the final mark maximum is %', total_out, fmax;
    end if;
  end if;
  return sid;
end $$;
revoke all on function public.save_assessment_structure(jsonb) from public, anon;
grant execute on function public.save_assessment_structure(jsonb) to authenticated;

-- Internal: copies one structure to a new place. Returns NULL when the target already has one.
create or replace function public._clone_assessment_structure(
  p_src uuid, p_semester uuid, p_grade uuid, p_stream uuid, p_subject uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.assessment_structures; nid uuid; g record; ng uuid; yr uuid;
begin
  select * into s from public.assessment_structures where id = p_src;
  if s.id is null then raise exception 'The structure to copy was not found'; end if;
  select academic_year_id into yr from public.semesters where id = p_semester;
  if yr is null then raise exception 'Semester not found'; end if;
  if exists (
       select 1 from public.assessment_structures x
       where x.semester_id = p_semester and x.grade_id = p_grade and x.subject_id = p_subject
         and coalesce(x.stream_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(p_stream, '00000000-0000-0000-0000-000000000000'::uuid)) then
    return null;
  end if;
  insert into public.assessment_structures
    (academic_year_id, semester_id, grade_id, stream_id, subject_id, final_max, rounding_places, formula)
  values (yr, p_semester, p_grade, p_stream, p_subject, s.final_max, s.rounding_places, s.formula)
  returning id into nid;
  for g in select * from public.assessment_groups where structure_id = p_src order by sort_order loop
    insert into public.assessment_groups (structure_id, code, name, name_am, scale_to, factor, sort_order)
    values (nid, g.code, g.name, g.name_am, g.scale_to, g.factor, g.sort_order)
    returning id into ng;
    insert into public.assessment_components (structure_id, group_id, name, name_am, raw_max, is_final_exam, sort_order)
    select nid, ng, k.name, k.name_am, k.raw_max, k.is_final_exam, k.sort_order
    from public.assessment_components k where k.group_id = g.id;
  end loop;
  return nid;
end $$;
revoke all on function public._clone_assessment_structure(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Copies a structure to other semesters, grades, streams or subjects.
-- p_targets: [{"semester_id": "...", "grade_id": "...", "stream_id": null, "subject_id": "..."}, ...]
-- Targets that already have a structure are left alone. Returns how many were created.
create or replace function public.copy_assessment_structure(p_source uuid, p_targets jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare t jsonb; n int := 0; r uuid;
begin
  if not public.has_role(array['system_admin','director','vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then raise exception 'No targets given'; end if;
  for t in select * from jsonb_array_elements(p_targets) loop
    r := public._clone_assessment_structure(
      p_source, (t->>'semester_id')::uuid, (t->>'grade_id')::uuid,
      nullif(t->>'stream_id', '')::uuid, (t->>'subject_id')::uuid);
    if r is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.copy_assessment_structure(uuid, jsonb) from public, anon;
grant execute on function public.copy_assessment_structure(uuid, jsonb) to authenticated;

-- Copies every structure of one academic year into another (semester 1 to semester 1, 2 to 2).
-- Structures that already exist in the target year are left alone. Returns how many were created.
create or replace function public.copy_structures_from_year(p_from uuid, p_to uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s record; tsem uuid; n int := 0; r uuid;
begin
  if not public.has_role(array['system_admin','director','vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  if p_from = p_to then raise exception 'Choose a different year to copy from'; end if;
  for s in
    select a.id, a.grade_id, a.stream_id, a.subject_id, sm.number
    from public.assessment_structures a join public.semesters sm on sm.id = a.semester_id
    where a.academic_year_id = p_from
  loop
    select id into tsem from public.semesters where academic_year_id = p_to and number = s.number;
    if tsem is null then continue; end if;
    r := public._clone_assessment_structure(s.id, tsem, s.grade_id, s.stream_id, s.subject_id);
    if r is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.copy_structures_from_year(uuid, uuid) from public, anon;
grant execute on function public.copy_structures_from_year(uuid, uuid) to authenticated;

-- ---------- 7. Settings ----------
-- pass_mark: percent of the final mark maximum needed to pass a subject (to be confirmed by the school).
-- yearly_rounding_places: decimals kept in the yearly average.
insert into public.school_settings (key, value) values ('pass_mark', '50'::jsonb) on conflict (key) do nothing;
insert into public.school_settings (key, value) values ('yearly_rounding_places', '1'::jsonb) on conflict (key) do nothing;

-- ---------- 8. Audit log ----------
-- (marks already has its audit trigger from 001; it records old and new values and who changed them.)
do $$
declare t text;
begin
  foreach t in array array['assessment_structures','assessment_groups','assessment_components','mark_locks']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

-- ---------- 9. Speed ----------
create index on public.mark_locks (section_id);
