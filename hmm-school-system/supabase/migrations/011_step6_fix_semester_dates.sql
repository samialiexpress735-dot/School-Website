-- =====================================================================
-- Step 6 fix (run AFTER 001 to 010, once).
--
-- Problem: attendance could be saved while the semester start/end dates were still empty,
-- but the semester summary only counts records that fall between those dates. With empty
-- dates every column (present, absent, late, excused, days) showed 0 even though the
-- records were saved.
--
-- Fix:
--  1. Attendance cannot be saved until BOTH semesters of the year have start and end dates.
--  2. If a semester still has no dates (records saved before this fix), the summary counts
--     the whole year instead of showing zeros. The screens show a warning for this case.
-- Nothing is deleted or changed in existing attendance records.
-- =====================================================================

-- 1) The guard on every attendance record: same rules as before, plus the dates rule ---------
create or replace function public.attendance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; closed boolean; dates_missing boolean; in_sem boolean; mgmt boolean;
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

  -- Absences are counted per semester, so both semesters need their dates first.
  select not exists (select 1 from public.semesters s where s.academic_year_id = e.academic_year_id)
         or exists (select 1 from public.semesters s
                    where s.academic_year_id = e.academic_year_id
                      and (s.start_date is null or s.end_date is null))
    into dates_missing;
  if dates_missing then
    raise exception 'Set the start and end dates of both semesters first (School structure > Academic years)';
  end if;

  select exists (select 1 from public.semesters s
                 where s.academic_year_id = e.academic_year_id
                   and new.attendance_date between s.start_date and s.end_date)
    into in_sem;
  if not in_sem then raise exception 'This date is outside both semesters'; end if;

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

-- 2) The summary: never show zeros because a semester has no dates ----------------------------
-- Same columns as before. The date window is used only when the chosen semester has both dates;
-- otherwise every record of the section's students is counted (the whole year).
create or replace function public.attendance_summary(p_section uuid, p_semester uuid default null)
returns table (enrollment_id uuid, present integer, absent integer, late integer, excused integer,
               days_recorded integer, threshold integer, flagged boolean)
language sql stable set search_path = public as $$
  with sem as (select start_date, end_date from public.semesters where id = p_semester),
  th as (select public.section_absence_threshold(p_section) as v),
  win as (select (p_semester is not null
                  and exists (select 1 from sem where start_date is not null and end_date is not null)) as use_dates)
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
   and (not (select use_dates from win)
        or a.attendance_date between (select start_date from sem) and (select end_date from sem))
  where en.section_id = p_section and en.status not in ('withdrawn', 'graduated')
  group by en.id
$$;
grant execute on function public.attendance_summary(uuid, uuid) to authenticated;
