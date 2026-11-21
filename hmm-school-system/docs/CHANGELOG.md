# Changelog

Newest first. "Run SQL" means paste the file into the Supabase SQL Editor and run it once.

## Blueprint sync for Steps 1-3 (before Step 4)
- Added: `supabase/migrations/006_blueprint_sync.sql`
- Edited: `src/pages/structure/SubjectsPage.jsx`, `src/pages/structure/SectionsPage.jsx`, `src/pages/staff/AssignmentsPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `006_blueprint_sync.sql` (once, after 001-005)
- What changed:
  - Subject lists per grade and stream are now **per academic year** (new column `grade_subjects.academic_year_id`). Existing lists are kept and copied to every existing year. The Subjects screen has a year picker and "Copy subject lists from another year"; closed years are read-only. The Teacher assignments screen uses the list of the selected year.
  - Draft subjects reconciled with blueprint 4.5: Citizenship Education, Health and Physical Education (HPE), Information Technology (IT), Agriculture added; Business and Technical Drawing switched off (not deleted; kept linked only if a teacher is already assigned to them).
  - Starting subject structure loaded for the current year (without the conditional HPE/Agriculture choices for Grades 11 and 12; periods per week left empty to fill in).
  - Sections: no fixed maximum (the 1 to 12 limit is removed; names continue A to Z, then AA, AB...), capacity is optional with no default of 50, and the Homeroom column now shows the real homeroom teacher instead of "Set in step 3".
  - The absence threshold (5 per semester) is stored in `school_settings` as `absence_threshold`; it is used in Step 6.
  - The old note calling the subject list a draft is replaced by a short explanation.
- After running: open **Structure > Subjects** and check the names and periods for each grade and stream.

## UI foundation (before Step 4)
- Added: nothing
- Edited: `src/styles.css`, `src/components/Shell.jsx`, `src/components/Protected.jsx`, `src/lib/ui.jsx`, `src/pages/DashboardPage.jsx`, `src/pages/LoginPage.jsx`, `src/pages/structure/` (YearsPage, CalendarPage, SubjectsPage, SectionsPage), `src/pages/staff/` (StaffListPage, StaffFormPage, DepartmentsPage, AssignmentsPage), `index.html`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: nothing
- What changed: new working color palette and animations from blueprint section 10; no database, login or logic changes. Pages only swap the plain "Loading..." line for the new `Loading` placeholder.

## Step 3 – Staff, accounts, assignments, homeroom
- Added: `supabase/migrations/005_step3_staff.sql`, `src/pages/staff/` (StaffLayout, StaffListPage, StaffFormPage, AssignmentsPage, DepartmentsPage)
- Edited: `src/App.jsx`, `src/lib/roles.js`, `src/lib/ui.jsx`, `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `005_step3_staff.sql` (once, after 001-004)

## Update 3 – Working rules
- Added: `docs/CHANGELOG.md`
- Edited: `docs/BLUEPRINT.md` (added section 9, "Working rules")
- Delete: nothing
- Run SQL: nothing

## Step 2 – School structure
- Added: `supabase/migrations/004_step2_structure.sql`, `src/lib/ethiopian.js`, `src/lib/roles.js`, `src/lib/ui.jsx`, `src/components/EcDate.jsx`, `src/components/Shell.jsx`, `src/components/Protected.jsx`, `src/pages/structure/` (StructureLayout, YearsPage, CalendarPage, SubjectsPage, SectionsPage)
- Edited: `src/App.jsx`, `src/pages/DashboardPage.jsx`, `src/lib/AuthContext.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `README.md`, `docs/BLUEPRINT.md`
- Delete: nothing
- Run SQL: `004_step2_structure.sql`

## Step 1 – Database and security
- Added: `supabase/migrations/001_core_schema.sql`, `002_security_policies.sql`, `003_seed_data.sql`
- Run SQL: 001, then 002, then 003

## Step 0 – Skeleton
- Added: the project skeleton (app, login, English/Amharic switch), `README.md`, `docs/BLUEPRINT.md`
