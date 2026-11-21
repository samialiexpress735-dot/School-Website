# Changelog

Newest first. "Run SQL" means paste the file into the Supabase SQL Editor and run it once.

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
