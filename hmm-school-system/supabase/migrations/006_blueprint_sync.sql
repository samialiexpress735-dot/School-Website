-- =====================================================================
-- Blueprint sync for Steps 1-3. Run AFTER 001-005. Run it once.
--  1. The subject list of each grade and stream is now kept PER ACADEMIC YEAR
--  2. The draft subject list from 003 is reconciled with blueprint 4.5
--  3. The starting subject structure is loaded for the current year
--     (only for grades and streams that have no subjects set yet)
--  4. The absence threshold (5 per semester) is stored as a setting
-- Older SQL files are never edited; all changes are made here.
-- =====================================================================

-- 1) grade_subjects belongs to an academic year -------------------------
drop index if exists public.grade_subjects_unique;

alter table public.grade_subjects
  add column academic_year_id uuid references public.academic_years(id) on delete cascade;

-- What is already set is kept: every existing row is copied to every existing year.
insert into public.grade_subjects (academic_year_id, grade_id, stream_id, subject_id, periods_per_week)
select y.id, gs.grade_id, gs.stream_id, gs.subject_id, gs.periods_per_week
from public.grade_subjects gs
cross join public.academic_years y
where gs.academic_year_id is null;

delete from public.grade_subjects where academic_year_id is null;

alter table public.grade_subjects alter column academic_year_id set not null;

create unique index grade_subjects_unique on public.grade_subjects (
  academic_year_id, grade_id,
  coalesce(stream_id, '00000000-0000-0000-0000-000000000000'::uuid),
  subject_id
);
create index grade_subjects_year_idx on public.grade_subjects (academic_year_id);

-- 2) Reconcile the draft subject list with blueprint 4.5 ----------------
update public.subjects
set name = 'Citizenship Education', name_am = 'የዜግነት ትምህርት'
where code = 'CIV';

update public.subjects
set code = 'HPE', name = 'Health and Physical Education (HPE)', name_am = 'ጤናና ሥነ አካል ትምህርት'
where code = 'PE';

update public.subjects
set code = 'IT', name = 'Information Technology (IT)'
where code = 'ICT';

insert into public.subjects (code, name, name_am)
values ('AGR', 'Agriculture', 'ግብርና')
on conflict (code) do nothing;

-- Business and Technical Drawing are not in the blueprint structure.
-- They are switched off (not deleted). Their grade links are removed unless
-- a teacher has already been assigned to the subject.
delete from public.grade_subjects g
using public.subjects s
where g.subject_id = s.id
  and s.code in ('BUS', 'TD')
  and not exists (select 1 from public.teacher_assignments ta where ta.subject_id = s.id);

update public.subjects set is_active = false where code in ('BUS', 'TD');

-- 3) Starting subject structure for the CURRENT year --------------------
-- Only the subjects the blueprint states without conditions are added.
-- HPE for Grades 11-12 and Agriculture for Grade 11-12 Social Science are
-- left for the school to confirm (blueprint section 8, item 2).
-- A grade and stream that already has subjects set is not touched.
insert into public.grade_subjects (academic_year_id, grade_id, stream_id, subject_id)
select y.id, g.id, st.id, su.id
from (select id from public.academic_years where is_current limit 1) y
cross join (
  select n as grade_no, 'general' as stream_code, c as subject_code
    from unnest(array[9, 10]) n,
         unnest(array['ENG','AMH','MATH','PHY','CHE','BIO','GEO','HIS','ECO','CIV','IT','HPE']) c
  union all
  select n, 'natural', c
    from unnest(array[11, 12]) n,
         unnest(array['ENG','AMH','MATH','PHY','CHE','BIO','IT','AGR']) c
  union all
  select n, 'social', c
    from unnest(array[11, 12]) n,
         unnest(array['ENG','AMH','MATH','GEO','HIS','ECO','IT']) c
) spec
join public.grades  g  on g.number = spec.grade_no
join public.streams st on st.code  = spec.stream_code
join public.subjects su on su.code = spec.subject_code
where not exists (
  select 1 from public.grade_subjects x
  where x.academic_year_id = y.id and x.grade_id = g.id and x.stream_id = st.id
);

-- 4) Absence threshold: 5 absences per semester (stays changeable) ------
insert into public.school_settings (key, value)
values ('absence_threshold', '5'::jsonb)
on conflict (key) do nothing;
