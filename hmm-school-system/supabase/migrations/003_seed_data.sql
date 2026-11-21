-- =====================================================================
-- Starting data. Run AFTER 001 and 002. Safe to edit before running.
-- IMPORTANT: the subject list below is a DRAFT. Check it against the
-- national curriculum (kehulum) and fix names before real use.
-- The subject-to-grade mapping (grade_subjects) is filled in Step 2.
-- =====================================================================

insert into public.grades (number, name, name_am) values
  (9,  'Grade 9',  'ዘጠነኛ ክፍል'),
  (10, 'Grade 10', 'አሥረኛ ክፍል'),
  (11, 'Grade 11', 'አሥራ አንደኛ ክፍል'),
  (12, 'Grade 12', 'አሥራ ሁለተኛ ክፍል');

insert into public.streams (code, name, name_am) values
  ('general', 'General (Grades 9-10)', 'አጠቃላይ (9-10)'),
  ('natural', 'Natural Science', 'የተፈጥሮ ሳይንስ'),
  ('social',  'Social Science',  'ማኅበራዊ ሳይንስ');

insert into public.departments (name, name_am) values
  ('Languages', 'ቋንቋዎች'),
  ('Mathematics', 'ሒሳብ'),
  ('Natural Sciences', 'የተፈጥሮ ሳይንስ'),
  ('Social Sciences', 'ማኅበራዊ ሳይንስ'),
  ('ICT and Technology', 'አይሲቲና ቴክኖሎጂ'),
  ('Physical Education', 'ሥነ አካል ትምህርት');

-- Ethiopian academic year 2019 E.C. (September 2026 - July 2027), set as current.
insert into public.academic_years (year_ec, label, gc_start_year, is_current)
values (2019, '2019 E.C.', 2026, true);

insert into public.semesters (academic_year_id, number)
select id, n from public.academic_years, (values (1), (2)) as s(n) where year_ec = 2019;

-- DRAFT subject list
insert into public.subjects (code, name, name_am) values
  ('AMH',  'Amharic',                         'አማርኛ'),
  ('ENG',  'English',                         'እንግሊዝኛ'),
  ('MATH', 'Mathematics',                     'ሒሳብ'),
  ('PHY',  'Physics',                         'ፊዚክስ'),
  ('CHE',  'Chemistry',                       'ኬሚስትሪ'),
  ('BIO',  'Biology',                         'ባዮሎጂ'),
  ('HIS',  'History',                         'ታሪክ'),
  ('GEO',  'Geography',                       'ጂኦግራፊ'),
  ('CIV',  'Civics and Ethical Education',    'ሲቪክስና ሥነ ምግባር'),
  ('ECO',  'Economics',                       'ኢኮኖሚክስ'),
  ('BUS',  'Business',                        'ቢዝነስ'),
  ('ICT',  'Information Technology',          'መረጃ ቴክኖሎጂ'),
  ('TD',   'Technical Drawing',               'ቴክኒካል ድሮዊንግ'),
  ('PE',   'Physical Education',              'ሥነ አካል ትምህርት');
