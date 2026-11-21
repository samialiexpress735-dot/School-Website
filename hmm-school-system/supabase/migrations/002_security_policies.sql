-- =====================================================================
-- Security rules (Row Level Security). Run AFTER 001.
-- Rule of thumb: no role = no access. Teachers only see and change
-- their own assigned sections. Student data is never public.
-- =====================================================================

-- ---------- Helper functions ----------
create or replace function public.current_user_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.has_role(roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = any(roles), false)
$$;

create or replace function public.my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff where profile_id = auth.uid()
$$;

-- Teacher assigned to this section (and subject, if given)
create or replace function public.teaches(p_section uuid, p_subject uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.staff_id = public.my_staff_id()
      and ta.section_id = p_section
      and (p_subject is null or ta.subject_id = p_subject)
  )
$$;

-- Teaches the section OR is its homeroom teacher (read access)
create or replace function public.in_my_section(p_section uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_section is not null and (
    public.teaches(p_section)
    or exists (select 1 from public.sections s
               where s.id = p_section and s.homeroom_staff_id = public.my_staff_id())
  )
$$;

create or replace function public.enrollment_section(p_enrollment uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select section_id from public.enrollments where id = p_enrollment
$$;

create or replace function public.assessment_subject(p_assessment uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select subject_id from public.assessment_types where id = p_assessment
$$;

create or replace function public.semester_locked(p_assessment uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.is_locked from public.assessment_types a
                   join public.semesters s on s.id = a.semester_id
                   where a.id = p_assessment), false)
$$;

create or replace function public.teacher_sees_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments e
                 where e.student_id = p_student and public.in_my_section(e.section_id))
$$;

-- Role groups used below
--   MGMT   = system_admin, director, vice_director
--   OFFICE = MGMT + registrar
--   ANY    = any signed-in user who has a role

-- ---------- Turn security on everywhere ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','academic_years','semesters','departments','grades','streams','subjects',
    'grade_subjects','staff','students','guardians','student_guardians','sections',
    'teacher_assignments','enrollments','assessment_types','marks','attendance',
    'promotions','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Reference data: everyone with a role reads; MGMT writes ----------
do $$
declare t text;
begin
  foreach t in array array['academic_years','semesters','departments','grades','streams','subjects','grade_subjects']
  loop
    execute format($f$create policy "%1$s read" on public.%1$s for select to authenticated
      using (public.current_user_role() is not null)$f$, t);
    execute format($f$create policy "%1$s write" on public.%1$s for all to authenticated
      using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
      with check (public.has_role(array['system_admin','director','vice_director']::app_role[]))$f$, t);
  end loop;
end $$;

-- ---------- Profiles ----------
create policy "profiles read own" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles read management" on public.profiles for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]));
-- Only the system administrator can change roles or switch accounts off.
create policy "profiles admin write" on public.profiles for update to authenticated
  using (public.has_role(array['system_admin']::app_role[]))
  with check (public.has_role(array['system_admin']::app_role[]));

-- ---------- Staff ----------
create policy "staff read office" on public.staff for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader','registrar']::app_role[])
         or profile_id = auth.uid());
create policy "staff write mgmt" on public.staff for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[]));

-- ---------- Students, guardians ----------
create policy "students read" on public.students for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader','registrar']::app_role[])
         or public.teacher_sees_student(id));
create policy "students write" on public.students for all to authenticated
  using (public.has_role(array['system_admin','registrar']::app_role[]))
  with check (public.has_role(array['system_admin','registrar']::app_role[]));

create policy "guardians read" on public.guardians for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','registrar']::app_role[]));
create policy "guardians write" on public.guardians for all to authenticated
  using (public.has_role(array['system_admin','registrar']::app_role[]))
  with check (public.has_role(array['system_admin','registrar']::app_role[]));

create policy "student_guardians read" on public.student_guardians for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','registrar']::app_role[]));
create policy "student_guardians write" on public.student_guardians for all to authenticated
  using (public.has_role(array['system_admin','registrar']::app_role[]))
  with check (public.has_role(array['system_admin','registrar']::app_role[]));

-- ---------- Sections, assignments, enrollments ----------
create policy "sections read" on public.sections for select to authenticated
  using (public.current_user_role() is not null);
create policy "sections write" on public.sections for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director','registrar']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director','registrar']::app_role[]));

create policy "assignments read" on public.teacher_assignments for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader','registrar']::app_role[])
         or staff_id = public.my_staff_id());
create policy "assignments write" on public.teacher_assignments for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[]));

create policy "enrollments read" on public.enrollments for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader','registrar']::app_role[])
         or public.in_my_section(section_id));
create policy "enrollments write" on public.enrollments for all to authenticated
  using (public.has_role(array['system_admin','registrar']::app_role[]))
  with check (public.has_role(array['system_admin','registrar']::app_role[]));

-- ---------- Marks ----------
create policy "assessments read" on public.assessment_types for select to authenticated
  using (public.current_user_role() is not null);
create policy "assessments write" on public.assessment_types for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[]));

create policy "marks read" on public.marks for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader']::app_role[])
         or public.in_my_section(public.enrollment_section(enrollment_id)));

-- Admin may always edit; a teacher may edit only their own subject and section,
-- and only while the mark and the semester are not locked.
create policy "marks write admin" on public.marks for all to authenticated
  using (public.has_role(array['system_admin']::app_role[]))
  with check (public.has_role(array['system_admin']::app_role[]));
create policy "marks teacher insert" on public.marks for insert to authenticated
  with check (
    public.has_role(array['teacher','unit_leader']::app_role[])
    and not public.semester_locked(assessment_type_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.assessment_subject(assessment_type_id))
  );
create policy "marks teacher update" on public.marks for update to authenticated
  using (
    public.has_role(array['teacher','unit_leader']::app_role[])
    and not is_locked
    and not public.semester_locked(assessment_type_id)
    and public.teaches(public.enrollment_section(enrollment_id), public.assessment_subject(assessment_type_id))
  )
  with check (
    not is_locked
    and public.teaches(public.enrollment_section(enrollment_id), public.assessment_subject(assessment_type_id))
  );
-- Director / vice director / unit leader can lock marks:
create policy "marks lock" on public.marks for update to authenticated
  using (public.has_role(array['director','vice_director','unit_leader']::app_role[]))
  with check (public.has_role(array['director','vice_director','unit_leader']::app_role[]));

-- ---------- Attendance ----------
create policy "attendance read" on public.attendance for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','unit_leader','registrar']::app_role[])
         or public.in_my_section(public.enrollment_section(enrollment_id)));
create policy "attendance write admin" on public.attendance for all to authenticated
  using (public.has_role(array['system_admin']::app_role[]))
  with check (public.has_role(array['system_admin']::app_role[]));
create policy "attendance teacher write" on public.attendance for all to authenticated
  using (public.has_role(array['teacher','unit_leader']::app_role[])
         and public.in_my_section(public.enrollment_section(enrollment_id)))
  with check (public.has_role(array['teacher','unit_leader']::app_role[])
         and public.in_my_section(public.enrollment_section(enrollment_id)));

-- ---------- Promotions ----------
create policy "promotions read" on public.promotions for select to authenticated
  using (public.has_role(array['system_admin','director','vice_director','registrar']::app_role[]));
create policy "promotions write" on public.promotions for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[]));

-- ---------- Audit log: read-only for leadership; written only by triggers ----------
create policy "audit read" on public.audit_log for select to authenticated
  using (public.has_role(array['system_admin','director']::app_role[]));

-- ---------- Blocks anonymous (not signed in) users completely ----------
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
