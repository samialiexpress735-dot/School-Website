-- =====================================================================
-- Step 3: staff, accounts, teacher assignments, homeroom teachers.
-- Run AFTER 001-004. Run it once.
-- =====================================================================

-- 1) Staff can be teaching or non-teaching (librarian, lab assistant, office...)
create type staff_type as enum ('teaching', 'non_teaching');
alter table public.staff
  add column staff_type staff_type not null default 'teaching',
  add column position text;                      -- job title, e.g. "Librarian"

-- 2) Show the login email on each profile so the admin can link accounts by email.
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, ''), new.email);
  return new;
end $$;

-- 3) One unit leader per department
alter table public.departments
  add column leader_staff_id uuid references public.staff(id) on delete set null;

-- 4) School settings (small key/value table)
create table public.school_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.school_settings enable row level security;
create policy "settings read" on public.school_settings for select to authenticated
  using (public.current_user_role() is not null);
create policy "settings write" on public.school_settings for all to authenticated
  using (public.has_role(array['system_admin','director','vice_director']::app_role[]))
  with check (public.has_role(array['system_admin','director','vice_director']::app_role[]));
insert into public.school_settings (key, value) values ('max_teacher_periods', '25'::jsonb);

-- 5) Only the system administrator can link or unlink a login account to a staff record.
--    (auth.uid() is null when SQL is run from the Supabase SQL Editor; that is allowed.)
create or replace function public.guard_staff_account_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.profile_id is distinct from (case when tg_op = 'UPDATE' then old.profile_id end)
     and not public.has_role(array['system_admin']::app_role[]) then
    raise exception 'Only the system administrator can link login accounts';
  end if;
  return new;
end $$;
create trigger staff_guard_account_link before insert or update on public.staff
for each row execute function public.guard_staff_account_link();

-- 6) Homeroom teachers: only admin / director / vice director may set them,
--    and the person must be active teaching staff.
create or replace function public.guard_homeroom() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.homeroom_staff_id is distinct from (case when tg_op = 'UPDATE' then old.homeroom_staff_id end) then
    if auth.uid() is not null and not public.has_role(array['system_admin','director','vice_director']::app_role[]) then
      raise exception 'Only the administration can set homeroom teachers';
    end if;
    if new.homeroom_staff_id is not null and not exists (
         select 1 from public.staff s where s.id = new.homeroom_staff_id
         and s.staff_type = 'teaching' and s.employment_status = 'active') then
      raise exception 'A homeroom teacher must be active teaching staff';
    end if;
  end if;
  return new;
end $$;
create trigger sections_guard_homeroom before insert or update on public.sections
for each row execute function public.guard_homeroom();

-- 7) Teacher assignments only go to active teaching staff.
create or replace function public.guard_assignment_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.staff s where s.id = new.staff_id
                 and s.staff_type = 'teaching' and s.employment_status = 'active') then
    raise exception 'Only active teaching staff can be assigned to teach';
  end if;
  return new;
end $$;
create trigger assignments_guard_staff before insert or update of staff_id on public.teacher_assignments
for each row execute function public.guard_assignment_staff();

-- 8) Audit log for the new tables
do $$
declare t text;
begin
  foreach t in array array['departments','school_settings']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.write_audit_log()', t);
  end loop;
end $$;
