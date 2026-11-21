-- =====================================================================
-- Haile Mariam Mamo Secondary School - core database structure (Step 1)
-- Run this FIRST in the Supabase SQL Editor, then 002, then 003.
-- Years are Ethiopian (E.C.). Every yearly record points to academic_years,
-- so history is never overwritten.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
create type app_role as enum (
  'system_admin', 'director', 'vice_director', 'unit_leader', 'registrar', 'teacher'
);
create type sex_type as enum ('male', 'female');
create type student_status as enum ('active', 'transferred_out', 'withdrawn', 'graduated');
create type enrollment_status as enum (
  'new', 'promoted', 'repeater', 'transfer_in', 'withdrawn', 'graduated'
);
create type attendance_status as enum ('present', 'absent', 'late', 'excused');
create type promotion_decision as enum ('promote', 'repeat', 'graduate', 'withdraw');

-- ---------- Small helper: keep updated_at current ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Users (linked to Supabase Auth) ----------
-- role is NULL until a system administrator assigns one = no access.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  full_name_am text,
  role app_role,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- School structure ----------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  year_ec integer not null unique check (year_ec between 1990 and 2100),  -- e.g. 2019
  label text not null,                                                   -- e.g. "2019 E.C."
  gc_start_year integer,                                                 -- e.g. 2026
  start_date date,
  end_date date,
  is_current boolean not null default false,
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_current_year on public.academic_years (is_current) where is_current;

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  number smallint not null check (number in (1, 2)),
  start_date date,
  end_date date,
  is_locked boolean not null default false,
  unique (academic_year_id, number)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_am text
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  number smallint not null unique check (number between 9 and 12),
  name text not null,
  name_am text
);

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- general, natural, social
  name text not null,
  name_am text
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_am text,
  is_active boolean not null default true
);

-- Which subjects each grade (and stream) learns
create table public.grade_subjects (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id) on delete cascade,
  stream_id uuid references public.streams(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  periods_per_week smallint check (periods_per_week > 0)
);
create unique index grade_subjects_unique
  on public.grade_subjects (grade_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_id);

-- ---------- Staff ----------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  employee_id text unique,
  first_name text not null,
  father_name text not null,
  grandfather_name text,
  first_name_am text,
  father_name_am text,
  grandfather_name_am text,
  sex sex_type not null,
  date_of_birth date,
  phone text,
  email text,
  address text,
  photo_url text,
  department_id uuid references public.departments(id) on delete set null,
  qualification text,
  field_of_study text,
  hire_date date,
  employment_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Students (registered ONCE; yearly placement is in enrollments) ----------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  first_name text not null,
  father_name text not null,
  grandfather_name text not null,
  first_name_am text,
  father_name_am text,
  grandfather_name_am text,
  sex sex_type not null,
  date_of_birth date not null,
  date_of_birth_ec text,                       -- e.g. "12/05/2004"
  place_of_birth text,
  nationality text not null default 'Ethiopian',
  religion text,
  photo_url text,
  admission_date date not null default current_date,
  -- address
  region text, zone text, woreda text, kebele text, house_number text, phone text,
  -- mother and emergency contact (guardians are stored separately)
  mother_full_name text,
  -- previous education
  previous_school text,
  previous_grade text,
  transfer_certificate_no text,
  grade8_exam_result numeric(5,2) check (grade8_exam_result between 0 and 100),
  -- other
  health_condition text,
  documents jsonb not null default '{}'::jsonb,  -- e.g. {"birth_certificate": true}
  status student_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  occupation text,
  address text,
  created_at timestamptz not null default now()
);

create table public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text not null,                 -- father, mother, uncle, ...
  is_primary boolean not null default false,
  is_emergency_contact boolean not null default false,
  primary key (student_id, guardian_id)
);

-- ---------- Sections and yearly records ----------
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  stream_id uuid references public.streams(id) on delete restrict,
  name text not null,                         -- A, B, C ...
  capacity smallint check (capacity > 0),
  homeroom_staff_id uuid references public.staff(id) on delete set null
);
create unique index sections_unique
  on public.sections (academic_year_id, grade_id, coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  unique (academic_year_id, section_id, subject_id)
);

-- One row per student per academic year: grade, section, stream, status.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  section_id uuid references public.sections(id) on delete set null,
  stream_id uuid references public.streams(id) on delete restrict,
  status enrollment_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

-- ---------- Marks ----------
create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  name text not null,                         -- Quiz, Test, Mid exam, Final ...
  name_am text,
  max_marks numeric(6,2) not null check (max_marks > 0),
  weight_percent numeric(5,2) not null check (weight_percent > 0 and weight_percent <= 100)
);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  assessment_type_id uuid not null references public.assessment_types(id) on delete restrict,
  score numeric(6,2) not null check (score >= 0),
  is_locked boolean not null default false,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, assessment_type_id)
);

-- A score can never be higher than the assessment's maximum.
create or replace function public.check_mark_not_above_max() returns trigger
language plpgsql as $$
declare max_allowed numeric;
begin
  select max_marks into max_allowed from public.assessment_types where id = new.assessment_type_id;
  if new.score > max_allowed then
    raise exception 'Score % is higher than the maximum % for this assessment', new.score, max_allowed;
  end if;
  return new;
end $$;
create trigger marks_max_check before insert or update on public.marks
for each row execute function public.check_mark_not_above_max();

-- ---------- Attendance ----------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  attendance_date date not null,
  subject_id uuid references public.subjects(id) on delete restrict,  -- NULL = daily roll call
  status attendance_status not null,
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index attendance_unique
  on public.attendance (enrollment_id, attendance_date, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------- Year-end promotion ----------
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.enrollments(id) on delete restrict,
  decision promotion_decision not null,
  to_academic_year_id uuid references public.academic_years(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz not null default now(),
  note text
);

-- ---------- Audit log ----------
create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, user_id)
  values (tg_table_name, coalesce(v_new->>'id', v_old->>'id'), tg_op, v_old, v_new, auth.uid());
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','staff','students','enrollments','marks','attendance','promotions','teacher_assignments']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.write_audit_log()', t);
  end loop;
  foreach t in array array['profiles','staff','students','enrollments','marks']
  loop
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- Speed ----------
create index on public.enrollments (academic_year_id, grade_id, section_id);
create index on public.marks (enrollment_id);
create index on public.attendance (enrollment_id, attendance_date);
create index on public.teacher_assignments (staff_id);
create index on public.sections (academic_year_id, grade_id);
