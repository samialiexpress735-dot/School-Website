-- =====================================================================
-- Step 6: daily attendance. Run AFTER 001 to 009 (once).
--  1. School days (Monday-Friday, minus holidays, exam days and breaks)
--  2. Rules on every attendance record, enforced in the database
--  3. save_daily_attendance: saves a whole section's roll call in one step
--  4. Absence threshold (5 per semester by default, changeable per section)
--  5. Summaries and the "at or above the threshold" list
--  Per-period attendance (with a subject) is Step 9 and is refused until then.
-- =====================================================================

-- 1) Settings and columns ------------------------------------------------
insert into public.school_settings (key, value)
values ('attendance_edit_school_days', '3'::jsonb)
on conflict (key) do nothing;

-- A section can have its own absence number. NULL = use the school default.
alter table public.sections
  add column if not exists absence_threshold smallint
  check (absence_threshold between 1 and 100);

alter table public.attendance
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

create index if not exists attendance_date_idx on public.attendance (attendance_date);

-- 2) School days ---------------------------------------------------------
create or replace function public.is_school_day(p_year uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_date) between 1 and 5
     and not exists (
       select 1 from public.school_calendar c
       where c.academic_year_id = p_year and c.calendar_date = p_date)
$$;

-- How many school days come after p_date, up to and including today.
-- 0 means p_date is today (or the latest school day).
create or replace function public.school_days_since(p_year uuid, p_date date) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
  from generate_series(p_date + 1, current_date, interval '1 day') d
  where public.is_school_day(p_year, d::date)
$$;

-- Teachers may register or correct only the most recent school days (default 3, today included).
create or replace function public.attendance_edit_window(p_year uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select p_date <= current_date
     and public.school_days_since(p_year, p_date) <
         coalesce((select (value #>> '{}')::int from public.school_settings where key = 'attendance_edit_school_days'), 3)
$$;

-- 3) Guard on every attendance record -----------------------------------
create or replace function public.attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; closed boolean; has_dates boolean; in_sem boolean; mgmt boolean;
begin
  mgmt := auth.uid() is null
          or public.has_role(array['system_admin','director','vice_director']::app_role[]);

  if tg_op = 'DELETE' then
    if not (auth.uid() is null or public.has_role(array['system_admin']::app_role[])) then
      raise exception 'Attendance records cannot be deleted. Change the status instead';
    end if;
    return old;
  end if;

  if new.subject_id is not null then
    raise exception 'Per-period attendance is not available yet. Only the daily roll call can be saved';
  end if;

  if tg_op = 'UPDATE' and (new.enrollment_id <> old.enrollment_id or new.attendance_date <> old.attendance_date) then
    raise exception 'The student and the date of an attendance record cannot be changed';
  end if;

  select en.academic_year_id, en.section_id, en.status into e
  from public.enrollments en where en.id = new.enrollment_id;

  select y.is_closed into closed from public.academic_years y where y.id = e.academic_year_id;
  if coalesce(closed, false) then raise exception 'This academic year is closed'; end if;

  if e.section_id is null then
    raise exception 'The student is not placed in a section yet';
  end if;
  if e.status in ('withdrawn', 'graduated') then
    raise exception 'Attendance cannot be taken for a withdrawn or graduated student';
  end if;

  if new.attendance_date > current_date then
    raise exception 'Attendance cannot be taken for a future date';
  end if;
  if not public.is_school_day(e.academic_year_id, new.attendance_date) then
    raise exception 'This date is not a school day (weekend, holiday, exam day or break)';
  end if;

  -- When the semester dates are set, the date must fall inside one of them.
  select exists (select 1 from public.semesters s
                 where s.academic_year_id = e.academic_year_id and s.start_date is not null and s.end_date is not null)
    into has_dates;
  if has_dates then
    select exists (select 1 from public.semesters s
                   where s.academic_year_id = e.academic_year_id
                     and new.attendance_date between s.start_date and s.end_date)
      into in_sem;
    if not in_sem then raise exception 'This date is outside both semesters'; end if;
  end if;

  if new.status = 'excused' and nullif(trim(coalesce(new.note, '')), '') is null then
    raise exception 'An excused absence needs a short note';
  end if;

  if not mgmt and not public.attendance_edit_window(e.academic_year_id, new.attendance_date) then
    raise exception 'Teachers can change attendance only for the last % school days. Ask the administration',
      coalesce((select (value #>> '{}')::int from public.school_settings where key = 'attendance_edit_school_days'), 3);
  end if;

  if tg_op = 'INSERT' then
    new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists attendance_guard on public.attendance;
create trigger attendance_guard before insert or update or delete on public.attendance
for each row execute function public.attendance_guard();

-- Who may write: the administration (any school day of an open year) and teachers of the section
-- (the guard above limits teachers to the last school days).
drop policy if exists "attendance write admin" on public.attendance;
drop policy if exists "attendance teacher write" on public.attendance;
drop policy if exists "attendance write" on public.attendance;
create policy "attendance write" on public.attendance for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[])
         or (public.has_role(array['teacher','unit_leader']::app_role[])
             and public.in_my_section(public.enrollment_section(enrollment_id))))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[])
         or (public.has_role(array['teacher','unit_leader']::app_role[])
             and public.in_my_section(public.enrollment_section(enrollment_id))));

-- 4) Save a whole roll call in one step ---------------------------------
-- p_rows: [{ "enrollment_id": "...", "status": "present|absent|late|excused", "note": "..." }]
-- Runs with the caller's own rights, so the security rules and the guard above apply.
-- Saving again for the same day updates the record; nothing is duplicated and unchanged rows are left alone.
create or replace function public.save_daily_attendance(p_section uuid, p_date date, p_rows jsonb) returns integer
language plpgsql set search_path = public as $$
declare r jsonb; n integer := 0; k integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Invalid attendance data'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from public.enrollments en
                   where en.id = (r->>'enrollment_id')::uuid and en.section_id = p_section) then
      raise exception 'A student in the list does not belong to this section';
    end if;
    insert into public.attendance as a (enrollment_id, attendance_date, subject_id, status, note)
    values ((r->>'enrollment_id')::uuid, p_date, null,
            (r->>'status')::attendance_status, nullif(trim(coalesce(r->>'note', '')), ''))
    on conflict (enrollment_id, attendance_date, (coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    do update set status = excluded.status, note = excluded.note
    where (a.status, a.note) is distinct from (excluded.status, excluded.note);
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public.save_daily_attendance(uuid, date, jsonb) from public, anon;
grant execute on function public.save_daily_attendance(uuid, date, jsonb) to authenticated;

-- 5) Absence threshold ---------------------------------------------------
create or replace function public.section_absence_threshold(p_section uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.absence_threshold from public.sections s where s.id = p_section),
    (select (value #>> '{}')::int from public.school_settings where key = 'absence_threshold'),
    5)
$$;

-- The homeroom teacher of a section, or the administration, can change the number for that section.
-- p_value NULL goes back to the school default. The change is written to the audit log.
create or replace function public.set_section_absence_threshold(p_section uuid, p_value integer) returns void
language plpgsql security definer set search_path = public as $$
declare old_v smallint;
begin
  if not (public.has_role(array['system_admin','director','vice_director']::app_role[])
          or public.is_homeroom(p_section)) then
    raise exception 'Only the homeroom teacher or the administration can change this number';
  end if;
  if p_value is not null and (p_value < 1 or p_value > 100) then
    raise exception 'The absence number must be between 1 and 100';
  end if;
  select absence_threshold into old_v from public.sections where id = p_section;
  update public.sections set absence_threshold = p_value where id = p_section;
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  values ('sections', p_section::text, 'ABSENCE_THRESHOLD',
          jsonb_build_object('absence_threshold', old_v),
          jsonb_build_object('absence_threshold', p_value), auth.uid());
end $$;
revoke all on function public.set_section_absence_threshold(uuid, integer) from public, anon;
grant execute on function public.set_section_absence_threshold(uuid, integer) to authenticated;

-- 6) Summaries -----------------------------------------------------------
-- Counts per student for one section, for one semester (or the whole year when p_semester is NULL).
-- Only "absent" counts toward the threshold; late and excused do not (assumption, blueprint 4.7).
-- Runs with the caller's rights, so each person sees only what their role allows.
create or replace function public.attendance_summary(p_section uuid, p_semester uuid default null)
returns table (enrollment_id uuid, present integer, absent integer, late integer, excused integer,
               days_recorded integer, threshold integer, flagged boolean)
language sql stable set search_path = public as $$
  with sem as (select start_date, end_date from public.semesters where id = p_semester),
  th as (select public.section_absence_threshold(p_section) as v)
  select en.id,
         count(*) filter (where a.status = 'present')::int,
         count(*) filter (where a.status = 'absent')::int,
         count(*) filter (where a.status = 'late')::int,
         count(*) filter (where a.status = 'excused')::int,
         count(a.id)::int,
         (select v from th),
         count(*) filter (where a.status = 'absent') >= (select v from th)
  from public.enrollments en
  left join public.attendance a
    on a.enrollment_id = en.id and a.subject_id is null
   and (p_semester is null
        or a.attendance_date between (select start_date from sem) and (select end_date from sem))
  where en.section_id = p_section and en.status not in ('withdrawn', 'graduated')
  group by en.id
$$;
grant execute on function public.attendance_summary(uuid, uuid) to authenticated;

-- Students at or above the threshold, over all sections the caller may see.
create or replace function public.attendance_flags(p_year uuid, p_semester uuid default null)
returns table (enrollment_id uuid, section_id uuid, absent integer, threshold integer)
language sql stable set search_path = public as $$
  select s.enrollment_id, sec.id, s.absent, s.threshold
  from public.sections sec
  cross join lateral public.attendance_summary(sec.id, p_semester) s
  where sec.academic_year_id = p_year and s.flagged
$$;
grant execute on function public.attendance_flags(uuid, uuid) to authenticated;
