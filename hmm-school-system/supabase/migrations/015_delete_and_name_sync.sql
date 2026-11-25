-- =====================================================================
-- Update 015: names stay in step, deleting staff, deleting school forms.
-- Run once, after 001-014.
--
--   1) The name on a person's dashboard comes from their login profile (profiles.full_name).
--      It was copied once, when the account was linked, and never again. Now a trigger copies the
--      staff names to the linked profile every time they change, and the existing profiles are
--      brought in line below.
--   2) Deleting a staff member (teaching or non-teaching) is checked by the database.
--   3) Deleting a report card form (school form) is one function; the page images are removed by the app.
-- =====================================================================

-- ---------- 1) Names: staff -> login profile ----------
create or replace function public.sync_profile_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_en text;
  v_am text;
begin
  if new.profile_id is null then
    return new;
  end if;
  v_en := nullif(concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.father_name), ''), nullif(trim(new.grandfather_name), '')), '');
  v_am := nullif(concat_ws(' ', nullif(trim(new.first_name_am), ''), nullif(trim(new.father_name_am), ''), nullif(trim(new.grandfather_name_am), '')), '');
  if v_am is not distinct from v_en then
    v_am := null;                      -- same as the English name: no separate Amharic name
  end if;
  update public.profiles
     set full_name = coalesce(v_en, ''), full_name_am = v_am
   where id = new.profile_id
     and (full_name is distinct from coalesce(v_en, '') or full_name_am is distinct from v_am);
  return new;
end $$;

drop trigger if exists staff_sync_profile_name on public.staff;
create trigger staff_sync_profile_name
after insert or update of first_name, father_name, grandfather_name, first_name_am, father_name_am, grandfather_name_am, profile_id
on public.staff
for each row execute function public.sync_profile_name();

-- Bring the profiles that are already linked in line with their staff record.
update public.profiles p
   set full_name = coalesce(x.en, ''),
       full_name_am = case when x.am is distinct from x.en then x.am end
  from (
    select s.profile_id,
           nullif(concat_ws(' ', nullif(trim(s.first_name), ''), nullif(trim(s.father_name), ''), nullif(trim(s.grandfather_name), '')), '') as en,
           nullif(concat_ws(' ', nullif(trim(s.first_name_am), ''), nullif(trim(s.father_name_am), ''), nullif(trim(s.grandfather_name_am), '')), '') as am
      from public.staff s
     where s.profile_id is not null
  ) x
 where p.id = x.profile_id
   and (p.full_name is distinct from coalesce(x.en, '')
        or p.full_name_am is distinct from (case when x.am is distinct from x.en then x.am end));

-- ---------- 2) Deleting a staff member ----------
-- Who: system admin, director, vice director (the same people who edit staff).
-- Rules, checked here so they hold wherever the delete comes from:
--   * a person with assignments in a CLOSED academic year cannot be deleted (closed years are read-only history);
--     set the status to resigned, transferred or retired instead
--   * a person with a login account can be deleted only by the system admin; the login loses its role
--     (the account itself stays in Supabase Authentication and can be removed there)
--   * nobody can delete their own staff record
-- What follows from a delete: assignments in open years are removed (existing rule), the person stops being
-- homeroom teacher or department leader of any section or department (existing rule). Marks and attendance
-- already entered are kept; they point to the login, not to the staff record.
create or replace function public.guard_staff_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]) then
    raise exception 'STAFF_DELETE_NOT_ALLOWED';
  end if;
  if exists (
    select 1 from public.teacher_assignments ta
      join public.academic_years y on y.id = ta.academic_year_id
     where ta.staff_id = old.id and y.is_closed
  ) then
    raise exception 'STAFF_HAS_CLOSED_YEAR_HISTORY';
  end if;
  if old.profile_id is not null then
    if auth.uid() is not null and old.profile_id = auth.uid() then
      raise exception 'STAFF_OWN_ACCOUNT';
    end if;
    if auth.uid() is not null and not public.has_role(array['system_admin']::app_role[]) then
      raise exception 'STAFF_ACCOUNT_LINKED';
    end if;
    update public.profiles set role = null where id = old.profile_id;   -- no role = no access
  end if;
  return old;
end $$;

drop trigger if exists staff_guard_delete on public.staff;
create trigger staff_guard_delete before delete on public.staff
for each row execute function public.guard_staff_delete();

-- ---------- 3) Deleting a report card form ----------
-- Until now a form could only be switched off. This removes the form and all its saved versions.
-- (The page images in the private bucket are removed by the app right after; see the storage rule below.)
create or replace function public.delete_report_template(p_template uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  if not exists (select 1 from public.report_templates where id = p_template) then
    raise exception 'Template not found';
  end if;
  -- the form points at its current version and every version points back at the form: loosen one side first
  update public.report_templates set current_version_id = null where id = p_template;
  delete from public.report_templates where id = p_template;   -- the versions go with it
end $$;

grant execute on function public.delete_report_template(uuid) to authenticated;

-- The administration may now remove page images of the report-forms bucket (needed when a whole form is deleted).
create policy "report forms delete" on storage.objects for delete to authenticated
  using (bucket_id = 'report-forms' and public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]));
