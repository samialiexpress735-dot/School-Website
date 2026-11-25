-- Step 10A: public website, first part (blueprint 4.11).
--   announcements            short notices shown on the public home page (publisher writes, everyone reads published ones)
--   admission_applications   pre-registration; visitors can only ADD one, through submit_application()
--   contact_messages         contact form; visitors can only ADD one, through submit_contact_message()
--   public_calendar()        current year, semester dates and holidays, for the Academics page
--   public_academics()       grades, streams and subjects of the current year, for the Academics page
-- Visitors (role anon) get NO access to students, marks, staff, guardians or any other core table.
-- Run once, after 001-013.

-- ---------- Announcements ----------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_en text check (title_en is null or length(trim(title_en)) between 1 and 160),
  title_am text check (title_am is null or length(trim(title_am)) between 1 and 160),
  body_en text check (body_en is null or length(body_en) <= 2000),
  body_am text check (body_am is null or length(body_am) <= 2000),
  starts_on date not null default current_date,
  ends_on date,
  is_published boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (title_en is not null or title_am is not null),
  check (ends_on is null or ends_on >= starts_on)
);
alter table public.announcements enable row level security;

create policy "announcements public read" on public.announcements for select to anon, authenticated
  using (is_published and starts_on <= current_date and (ends_on is null or ends_on >= current_date));
-- The system admin cannot publish (blueprint 4.11); a Publisher flag for staff comes with the publishing screens.
create policy "announcements manage" on public.announcements for all to authenticated
  using (public.has_role(array['director','vice_director']::app_role[]))
  with check (public.has_role(array['director','vice_director']::app_role[]));

-- ---------- Admission applications ----------
create table public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  child_name text not null check (length(trim(child_name)) between 2 and 120),
  date_of_birth date not null,
  grade_applied smallint not null check (grade_applied between 9 and 12),
  previous_school text check (previous_school is null or length(previous_school) <= 160),
  guardian_name text not null check (length(trim(guardian_name)) between 2 and 120),
  guardian_phone text not null check (guardian_phone ~ '^[0-9+() -]{7,20}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admission_applications enable row level security;

-- No insert policy on purpose: visitors add one only through submit_application().
create policy "applications read" on public.admission_applications for select to authenticated
  using (public.has_role(array['registrar','director','vice_director']::app_role[]));
create policy "applications review" on public.admission_applications for update to authenticated
  using (public.has_role(array['registrar','director','vice_director']::app_role[]))
  with check (public.has_role(array['registrar','director','vice_director']::app_role[]));

-- ---------- Contact messages ----------
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (length(trim(sender_name)) between 2 and 120),
  sender_contact text not null check (length(trim(sender_contact)) between 5 and 120),
  message text not null check (length(trim(message)) between 10 and 2000),
  is_handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

create policy "messages read" on public.contact_messages for select to authenticated
  using (public.has_role(array['director','vice_director']::app_role[]));
create policy "messages handle" on public.contact_messages for update to authenticated
  using (public.has_role(array['director','vice_director']::app_role[]))
  with check (public.has_role(array['director','vice_director']::app_role[]));

-- Visitors may not touch these two tables directly at all.
revoke all on public.admission_applications, public.contact_messages from anon;
-- Visitors may only read announcements (the policy above shows them only the live, published ones).
revoke all on public.announcements from anon;
grant select on public.announcements to anon;

-- ---------- Submit an application (the only way a visitor can add one) ----------
-- p_trap is a hidden field that people never see; a robot fills it in. A filled trap looks like
-- success but saves nothing. A safety limit stops a flood: at most 40 applications per hour for the whole school.
create or replace function public.submit_application(
  p_child_name text, p_date_of_birth date, p_grade smallint,
  p_previous_school text, p_guardian_name text, p_guardian_phone text, p_trap text default ''
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_trap, '') <> '' then return; end if;
  if p_date_of_birth is null or p_date_of_birth > current_date - interval '8 years'
     or p_date_of_birth < current_date - interval '30 years' then
    raise exception 'Check the date of birth';
  end if;
  if (select count(*) from public.admission_applications where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Too many requests, please try again later';
  end if;
  insert into public.admission_applications
    (child_name, date_of_birth, grade_applied, previous_school, guardian_name, guardian_phone)
  values
    (trim(p_child_name), p_date_of_birth, p_grade, nullif(trim(coalesce(p_previous_school, '')), ''),
     trim(p_guardian_name), trim(p_guardian_phone));
end $$;
revoke all on function public.submit_application(text, date, smallint, text, text, text, text) from public;
grant execute on function public.submit_application(text, date, smallint, text, text, text, text) to anon, authenticated;

-- ---------- Send a contact message ----------
create or replace function public.submit_contact_message(
  p_name text, p_contact text, p_message text, p_trap text default ''
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_trap, '') <> '' then return; end if;
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many requests, please try again later';
  end if;
  insert into public.contact_messages (sender_name, sender_contact, message)
  values (trim(p_name), trim(p_contact), trim(p_message));
end $$;
revoke all on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

-- ---------- School calendar for the public Academics page ----------
create or replace function public.public_calendar() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'year_label', y.label,
    'year_ec', y.year_ec,
    'start_date', y.start_date,
    'end_date', y.end_date,
    'semesters', coalesce((select jsonb_agg(jsonb_build_object('number', s.number, 'start_date', s.start_date, 'end_date', s.end_date) order by s.number)
                           from public.semesters s where s.academic_year_id = y.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('date', c.calendar_date, 'kind', c.kind, 'name', c.name, 'name_am', c.name_am) order by c.calendar_date)
                        from public.school_calendar c where c.academic_year_id = y.id), '[]'::jsonb)
  )
  from (select id, label, year_ec, start_date, end_date from public.academic_years where is_current limit 1) y
$$;
revoke all on function public.public_calendar() from public;
grant execute on function public.public_calendar() to anon, authenticated;

-- ---------- Grades, streams and subjects of the current year ----------
create or replace function public.public_academics() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'grades', coalesce((select jsonb_agg(jsonb_build_object('number', g.number, 'name', g.name, 'name_am', g.name_am) order by g.number)
                        from public.grades g), '[]'::jsonb),
    'streams', coalesce((select jsonb_agg(jsonb_build_object('code', st.code, 'name', st.name, 'name_am', st.name_am) order by st.code)
                         from public.streams st), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('grade', g.number, 'stream', st.code, 'name', s.name, 'name_am', s.name_am) order by g.number, st.code nulls first, s.name)
      from public.grade_subjects gs
      join public.academic_years y on y.id = gs.academic_year_id and y.is_current
      join public.grades g on g.id = gs.grade_id
      join public.subjects s on s.id = gs.subject_id and s.is_active
      left join public.streams st on st.id = gs.stream_id
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.public_academics() from public;
grant execute on function public.public_academics() to anon, authenticated;
