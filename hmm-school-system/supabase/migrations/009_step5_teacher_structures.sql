-- =====================================================================
-- Step 5 update: teachers edit the mark structure of their own subject.
-- Run AFTER 001-008. Run it once. 008 is not edited.
--  1. structure_edit_status(): one place that says who may change a structure
--     (and why not): the system admin, director and vice director always;
--     a TEACHER only for a subject and grade they are assigned to, and only
--     while the semester is open and the subject is not finalized.
--     Unit leaders and registrars cannot.
--  2. The write rules (Row Level Security) of the three structure tables use it.
--  3. save_assessment_structure() accepts an assigned teacher. Removing an
--     assessment that has marks needs an explicit confirmation flag; the marks
--     are then deleted and the audit log records who did it and how many.
--  4. delete_assessment_structure(): the same confirmed deletion for a whole structure.
--  5. structure_mark_counts(): how many marks and students a structure has
--     (counts across ALL sections, which a teacher cannot read directly), so the
--     screen can show an accurate confirmation message.
-- Changing the school settings (pass mark and so on) stays with the three administrators.
-- Copying structures (copy_assessment_structure, copy_structures_from_year) stays
-- with the three administrators.
-- =====================================================================

-- ---------- 1. Who may change a structure, and why not ----------
-- Returns: 'ok', 'closed_year', 'semester_locked', 'finalized', 'not_assigned', 'not_allowed', 'no_access'.
create or replace function public.structure_edit_status(
  p_year uuid, p_grade uuid, p_stream uuid, p_subject uuid, p_semester uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare st uuid; sem_locked boolean; closed boolean;
begin
  if public.current_user_role() is null then return 'no_access'; end if;
  -- The three administrators: as before (a closed year is refused by the table guards).
  if public.has_role(array['system_admin','director','vice_director']::app_role[]) then return 'ok'; end if;
  if not public.has_role(array['teacher']::app_role[]) then return 'not_allowed'; end if;

  select is_closed into closed from public.academic_years where id = p_year;
  if coalesce(closed, false) then return 'closed_year'; end if;

  st := public.stream_key(p_stream);   -- NULL = all streams of the grade (and Grades 9-10)
  -- The teacher must be assigned to this subject in a section of this year and grade
  -- (and of this stream, when the structure is for one stream only).
  if not exists (
       select 1
       from public.teacher_assignments ta
       join public.sections sec on sec.id = ta.section_id
       where ta.staff_id = public.my_staff_id()
         and ta.academic_year_id = p_year
         and ta.subject_id = p_subject
         and sec.grade_id = p_grade
         and (st is null or public.stream_key(sec.stream_id) = st)) then
    return 'not_assigned';
  end if;

  select is_locked into sem_locked from public.semesters where id = p_semester;
  if coalesce(sem_locked, false) then return 'semester_locked'; end if;

  -- Finalized in any section this structure covers: only the administration can reopen it first.
  if exists (
       select 1
       from public.mark_locks l
       join public.sections sec on sec.id = l.section_id
       where l.semester_id = p_semester
         and l.subject_id = p_subject
         and sec.grade_id = p_grade
         and (st is null or public.stream_key(sec.stream_id) = st)) then
    return 'finalized';
  end if;
  return 'ok';
end $$;

create or replace function public.structure_edit_status_of(p_structure uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public.structure_edit_status(s.academic_year_id, s.grade_id, s.stream_id, s.subject_id, s.semester_id)
     from public.assessment_structures s where s.id = p_structure),
    'not_allowed')
$$;

create or replace function public.can_edit_structure(p_structure uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.structure_edit_status_of(p_structure) = 'ok'
$$;

revoke all on function public.structure_edit_status(uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.structure_edit_status_of(uuid) from public, anon;
revoke all on function public.can_edit_structure(uuid) from public, anon;
grant execute on function public.structure_edit_status(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.structure_edit_status_of(uuid) to authenticated;
grant execute on function public.can_edit_structure(uuid) to authenticated;

-- ---------- 2. Write rules of the structure tables ----------
-- Reading is unchanged (everyone with a role reads, policy "<table> read" from 008).
drop policy if exists "assessment_structures write" on public.assessment_structures;
create policy "assessment_structures write" on public.assessment_structures for all to authenticated
  using (public.can_edit_structure(id))
  with check (public.structure_edit_status(academic_year_id, grade_id, stream_id, subject_id, semester_id) = 'ok');

drop policy if exists "assessment_groups write" on public.assessment_groups;
create policy "assessment_groups write" on public.assessment_groups for all to authenticated
  using (public.can_edit_structure(structure_id))
  with check (public.can_edit_structure(structure_id));

drop policy if exists "assessment_components write" on public.assessment_components;
create policy "assessment_components write" on public.assessment_components for all to authenticated
  using (public.can_edit_structure(structure_id))
  with check (public.can_edit_structure(structure_id));

-- ---------- 3. Counts for the confirmation message ----------
-- {"marks": n, "students": n, "components": {"<component id>": {"marks": n, "students": n}},
--  "selected": {"marks": n, "students": n}}
-- "selected" is only present when p_components is given: the marks, and the distinct students,
-- of just those assessments (the ones the person is about to remove).
-- Counts cover every section, so they are exact even for a teacher who sees only their own marks.
create or replace function public.structure_mark_counts(p_structure uuid, p_components uuid[] default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total_marks int; total_students int; per jsonb; sel_marks int := 0; sel_students int := 0;
begin
  if not (public.has_role(array['system_admin','director','vice_director']::app_role[])
          or public.can_edit_structure(p_structure)) then
    raise exception 'Not allowed';
  end if;
  select count(*), count(distinct m.enrollment_id) into total_marks, total_students
  from public.marks m join public.assessment_components c on c.id = m.component_id
  where c.structure_id = p_structure;

  select coalesce(jsonb_object_agg(x.component_id::text, jsonb_build_object('marks', x.n, 'students', x.s)), '{}'::jsonb)
    into per
  from (
    select m.component_id, count(*) as n, count(distinct m.enrollment_id) as s
    from public.marks m join public.assessment_components c on c.id = m.component_id
    where c.structure_id = p_structure
    group by m.component_id
  ) x;

  if p_components is not null then
    select count(*), count(distinct m.enrollment_id) into sel_marks, sel_students
    from public.marks m join public.assessment_components c on c.id = m.component_id
    where c.structure_id = p_structure and m.component_id = any(p_components);
  end if;

  return jsonb_build_object('marks', total_marks, 'students', total_students, 'components', per)
      || case when p_components is not null
              then jsonb_build_object('selected', jsonb_build_object('marks', sel_marks, 'students', sel_students))
              else '{}'::jsonb end;
end $$;
revoke all on function public.structure_mark_counts(uuid, uuid[]) from public, anon;
grant execute on function public.structure_mark_counts(uuid, uuid[]) to authenticated;

-- ---------- 4. Audit summary ----------
-- One extra line in the audit log for every structure change by a person, with their name
-- and how many marks were affected. (The table triggers from 008 still record every row change.)
create or replace function public._audit_structure_change(
  p_structure uuid, p_action text, p_marks_deleted int, p_students_deleted int, p_marks_in_structure int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  values ('assessment_structures', p_structure::text, p_action, null,
          jsonb_build_object(
            'by_name', coalesce((select pr.full_name from public.profiles pr where pr.id = auth.uid()), ''),
            'marks_deleted', p_marks_deleted,
            'students_of_deleted_marks', p_students_deleted,
            'marks_in_structure', p_marks_in_structure),
          auth.uid());
end $$;
revoke all on function public._audit_structure_change(uuid, text, int, int, int) from public, anon, authenticated;

-- ---------- 5. Save a whole structure (replaces the function of 008) ----------
-- payload extra: "confirm_delete_marks": true  = the person confirmed that the marks of removed
-- assessments may be deleted. Without it, removing an assessment that has marks is refused.
create or replace function public.save_assessment_structure(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := nullif(p->>'id', '')::uuid;
  g jsonb; c jsonb; gid uuid; cid uuid;
  keep_groups uuid[]; keep_comps uuid[]; gone_comps uuid[];
  gi int := 0; ci int;
  total_out numeric; fmax numeric;
  status text; s public.assessment_structures;
  del_marks int := 0; del_students int := 0; all_marks int := 0;
  confirmed boolean := coalesce((p->>'confirm_delete_marks')::boolean, false);
begin
  -- Who may save: the administration, or a teacher of this subject (see structure_edit_status).
  if sid is null then
    status := public.structure_edit_status(
      (p->>'academic_year_id')::uuid, (p->>'grade_id')::uuid, nullif(p->>'stream_id', '')::uuid,
      (p->>'subject_id')::uuid, (p->>'semester_id')::uuid);
  else
    select * into s from public.assessment_structures where id = sid;
    if s.id is null then raise exception 'Structure not found'; end if;
    status := public.structure_edit_status(s.academic_year_id, s.grade_id, s.stream_id, s.subject_id, s.semester_id);
  end if;
  if status = 'finalized' then
    raise exception 'The marks of this subject are finalized. The director, vice director or system admin must reopen them first.';
  elsif status = 'semester_locked' then
    raise exception 'This semester is locked. Marks structures cannot be changed.';
  elsif status = 'closed_year' then
    raise exception 'This academic year is closed';
  elsif status <> 'ok' then
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
  end if;

  -- What stays: ids listed in the payload.
  select coalesce(array_agg(nullif(x->>'id', '')::uuid) filter (where nullif(x->>'id', '') is not null), '{}')
    into keep_groups from jsonb_array_elements(p->'groups') x;
  select coalesce(array_agg(nullif(y->>'id', '')::uuid) filter (where nullif(y->>'id', '') is not null), '{}')
    into keep_comps
  from jsonb_array_elements(p->'groups') x, jsonb_array_elements(coalesce(x->'components', '[]'::jsonb)) y;

  -- Assessments that are no longer listed (and those of removed groups).
  select coalesce(array_agg(id), '{}') into gone_comps
  from public.assessment_components where structure_id = sid and not (id = any(keep_comps));

  select count(*), count(distinct enrollment_id) into del_marks, del_students
  from public.marks where component_id = any(gone_comps);
  if del_marks > 0 and not confirmed then
    raise exception 'CONFIRM_NEEDED: % marks would be deleted. Confirm the deletion first.', del_marks;
  end if;

  select count(*) into all_marks
  from public.marks m join public.assessment_components k on k.id = m.component_id
  where k.structure_id = sid;

  -- Remove first, so a new group may reuse the code of a removed one.
  if del_marks > 0 then
    delete from public.marks where component_id = any(gone_comps);   -- each deleted mark is audited by the marks trigger
  end if;
  delete from public.assessment_components where structure_id = sid and not (id = any(keep_comps));
  delete from public.assessment_groups where structure_id = sid and not (id = any(keep_groups));

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

  perform public._audit_structure_change(sid, case when del_marks > 0 then 'SAVE_STRUCTURE_DELETED_MARKS' else 'SAVE_STRUCTURE' end,
                                         del_marks, del_students, all_marks - del_marks);
  return sid;
end $$;
revoke all on function public.save_assessment_structure(jsonb) from public, anon;
grant execute on function public.save_assessment_structure(jsonb) to authenticated;

-- ---------- 6. Delete a whole structure ----------
-- Returns the number of marks that were deleted with it. When marks exist, the call is refused
-- unless p_confirm_delete_marks is true (the screen asks the person first).
create or replace function public.delete_assessment_structure(p_id uuid, p_confirm_delete_marks boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare status text; n int; stu int;
begin
  status := public.structure_edit_status_of(p_id);
  if status = 'finalized' then
    raise exception 'The marks of this subject are finalized. The director, vice director or system admin must reopen them first.';
  elsif status = 'semester_locked' then
    raise exception 'This semester is locked. Marks structures cannot be changed.';
  elsif status = 'closed_year' then
    raise exception 'This academic year is closed';
  elsif status <> 'ok' then
    raise exception 'Not allowed';
  end if;

  select count(*), count(distinct m.enrollment_id) into n, stu
  from public.marks m join public.assessment_components c on c.id = m.component_id
  where c.structure_id = p_id;
  if n > 0 and not coalesce(p_confirm_delete_marks, false) then
    raise exception 'CONFIRM_NEEDED: % marks would be deleted. Confirm the deletion first.', n;
  end if;

  perform public._audit_structure_change(p_id, 'DELETE_STRUCTURE', n, stu, n);   -- written before the rows disappear
  delete from public.marks where component_id in (select id from public.assessment_components where structure_id = p_id);
  delete from public.assessment_structures where id = p_id;   -- groups and assessments go with it
  return n;
end $$;
revoke all on function public.delete_assessment_structure(uuid, boolean) from public, anon;
grant execute on function public.delete_assessment_structure(uuid, boolean) to authenticated;
