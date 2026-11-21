-- =====================================================================
-- Step 2: school structure. Run AFTER 001, 002 and 003.
--  1. Unit leaders can no longer assign teachers
--  2. Shifts (morning / afternoon) on sections
--  3. School calendar (holidays, exam days, breaks)
--  4. Safe "make this the current year" function
--  5. A section that has students cannot be deleted
-- =====================================================================

-- 1) Only system admin, director and vice director assign teachers.
drop policy if exists "assignments write" on public.teacher_assignments;
create policy "assignments write" on public.teacher_assignments for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[]));

-- 2) Shifts. Existing sections become "morning". Section A can now exist in both shifts.
create type shift_type as enum ('morning', 'afternoon');
alter table public.sections add column shift shift_type not null default 'morning';
drop index if exists public.sections_unique;
create unique index sections_unique on public.sections (
  academic_year_id, grade_id,
  coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
  shift, name
);

-- 3) School calendar. Saturdays and Sundays are never school days, so only
--    Monday-Friday dates are stored here.
create type calendar_day_kind as enum ('holiday', 'exam', 'break');
create table public.school_calendar (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  calendar_date date not null,
  kind calendar_day_kind not null default 'holiday',
  name text not null,
  name_am text,
  unique (academic_year_id, calendar_date),
  check (extract(isodow from calendar_date) between 1 and 5)
);
alter table public.school_calendar enable row level security;
create policy "calendar read" on public.school_calendar for select to authenticated
  using (public.current_user_role() is not null);
create policy "calendar write" on public.school_calendar for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[]));

-- 4) Only one year can be current. This switches it in one safe step.
create or replace function public.set_current_year(p_year uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['system_admin','director','vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  update public.academic_years set is_current = false where is_current and id <> p_year;
  update public.academic_years set is_current = true where id = p_year;
end $$;
revoke all on function public.set_current_year(uuid) from public, anon;
grant execute on function public.set_current_year(uuid) to authenticated;

-- 5) A section with enrolled students cannot be deleted.
create or replace function public.block_section_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.enrollments where section_id = old.id) then
    raise exception 'This section has students and cannot be deleted';
  end if;
  return old;
end $$;
create trigger sections_block_delete before delete on public.sections
for each row execute function public.block_section_delete();

-- Record changes to the school structure in the audit log.
do $$
declare t text;
begin
  foreach t in array array['academic_years','semesters','sections','school_calendar','subjects','grade_subjects']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.write_audit_log()', t);
  end loop;
end $$;
