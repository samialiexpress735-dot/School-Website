# Changelog

Newest first. "Run SQL" means paste the file into the Supabase SQL Editor and run it once.

## Step 6 fix – Attendance summary showed zeros when semester dates were empty
- Added: `supabase/migrations/011_step6_fix_semester_dates.sql`, `tests/semesterDates.test.js`
- Edited: `src/lib/attendance.js`, `src/pages/attendance/AttendanceParts.jsx`, `src/pages/attendance/RollCallPage.jsx`, `src/pages/attendance/SummaryPage.jsx`, `src/pages/attendance/FlagsPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `011_step6_fix_semester_dates.sql` (once, after 001-010). No existing record is changed.
- **Cause:** the summary counts only records dated between the chosen semester's start and end dates. When those dates were empty, nothing matched, so present, absent, late, excused and days all showed 0, while the roll call had saved the records (the old rule only checked the dates when they existed).
- **Fix:** (1) attendance cannot be saved until both semesters have start and end dates (clear message: set them under School structure > Academic years); (2) if a semester has no dates, the summary and the absence-limit list use the whole year instead of zeros; (3) a warning is shown on the Roll call, Summary and Absence limit screens.
- **What you must do after running it:** open **School structure > Academic years** and set the start and end dates of both semesters of every year that has attendance. Then the semester summary counts per semester.
- Tested: SQL 001 to 011 in order on a local PostgreSQL. The problem was reproduced first (2 absent + 1 late saved, summary showed 0 for the chosen semester, 2 and 1 for the whole year). After the fix: summary equals the raw table for a teacher, the registrar and the director; saving with empty dates, with only one semester dated, and outside both semesters is refused; with both dated it works. `npm test` passes (25 tests) and the warning component was rendered in English and Amharic. The three screens were not clicked through in a real browser.
- Not changed: records saved on dates that lie outside the dates you later set stay in the database; they appear in no semester total. Check the dates before real use.

## Step 6 – Daily attendance
- Added: `supabase/migrations/010_step6_attendance.sql`, `src/lib/attendance.js`, `tests/attendance.test.js`, `src/pages/attendance/` (AttendanceLayout, AttendanceParts, RollCallPage, SummaryPage, FlagsPage)
- Edited: `src/App.jsx`, `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/lib/roles.js`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `010_step6_attendance.sql` (once, after 001-009).
- What changed:
  - **Daily roll call:** pick year, section and date (previous and next school day buttons; Ethiopian date shown). Everyone starts as present; change the exceptions (absent, late, excused) and save. Excused needs a note. Saving again updates the same day; unchanged students are not rewritten.
  - **Rules in the database:** Monday to Friday only, no holidays, exam days or breaks, no future dates, inside the semester dates, closed year read-only, per-period records refused until Step 9. Teachers (and unit leaders who teach) can change only the **last 3 school days** and only their own sections; the system admin, director and vice director can correct any school day of an open year. Registrars and other unit leaders can read only. Every change is audited.
  - **Absence limit:** school default 5 per semester (setting `absence_threshold`); each section can have its own number, changed by its homeroom teacher or the administration and recorded in the audit log. Only absent counts; late and excused do not.
  - **Summary and Absence limit screens:** totals per student per semester, and the list of students at or above the limit for the people allowed to see them. These are screens, not messages; notifications come in Step 9.
  - **Policy change:** the director and vice director can now write attendance (before, only the system admin could). The old two write rules were replaced by one.
- After running: sign in as a homeroom teacher, open **Attendance**, mark one student absent and save; try a date older than 3 school days (refused), then sign in as the director and correct it.
- Tested: SQL 001 to 010 run in order on a local PostgreSQL and checked as a homeroom teacher, another teacher, the director, a registrar and a unit leader (save, repeat save, change, note rule, window, weekend, holiday, future date, per-period, delete, threshold change and audit, summary, flags, closed year). The app builds and `npm test` passes (20 tests). The three screens were rendered in a simulated browser against a mock backend (English and Amharic, saving, the note check); they were **not** clicked through in a real browser or on a phone. Test a real save on your Supabase first.

## UI polish update – lead-designer review
- Added: nothing
- Edited: `src/styles.css`, `src/components/Shell.jsx`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No database change.
- What changed: wider working area (72rem); monogram tile on the top bar and login; dashboard modules as a card grid; 44 px minimum height for buttons and fields; clearer table headers with light zebra rows; page-title underline; panel heading rule; footer with the school name. Full list and the work still to do: blueprint section 10.9.
- Tested: the app builds and `npm test` passes (15 tests). The screens were not viewed in a browser; please check them on a desktop and a phone, in English and Amharic, before relying on them.

## Step 5 update – Teachers edit the mark structure of their own subject
- Added: `supabase/migrations/009_step5_teacher_structures.sql`
- Edited: `src/lib/roles.js`, `src/pages/marks/StructuresPage.jsx`, `src/pages/marks/StructureEditor.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `009_step5_teacher_structures.sql` (once, after 001-008).
- What changed:
  - **Teachers** now see the **Structures** tab and can create and edit the structure (groups, assessments, maximums, final exam, formula, rounding) of the subjects they are assigned to, for the grade (and stream) they teach. Teachers of different sections of the same subject and grade share one structure; the editor says so.
  - **Test assessments are allowed.** An assessment without marks can be changed or deleted freely. When marks exist, saving shows a confirmation that states how many marks and students are affected ("12 marks of 12 students will be deleted", "The results of 40 students will be recalculated") and nothing changes until the teacher confirms. Deleting a whole structure that has marks asks the same way. The counts include every section, not only the teacher's own.
  - **Blocked cases:** a section that is finalized (any section the shared structure covers), a locked semester and a closed year cannot be changed by a teacher; the editor shows the reason. Only the director, vice director and system admin can reopen first. A maximum still cannot go below a mark already entered.
  - **Database:** new `structure_edit_status` (one rule for who may change a structure), new write rules on the three structure tables, `save_assessment_structure` replaced (accepts an assigned teacher; refuses to delete marks without confirmation), new `delete_assessment_structure` and `structure_mark_counts`. Every save writes an audit line with the person's name and the number of marks deleted.
  - **Unchanged:** unit leaders and registrars cannot edit structures; copying structures and the school settings (pass mark, rounding) stay with the system admin, director and vice director.
- After running: sign in as a teacher who is assigned to a subject, open **Marks > Structures**, set up a structure, enter a test mark, then remove that assessment and check the confirmation message.
- Tested: the SQL was run in order 001 to 009 on a local PostgreSQL and checked as a teacher, a second teacher, a unit leader and the system admin (assigned and unassigned subject, direct table writes, shared structure across two sections, finalized, locked semester, closed year, deletion with and without confirmation, audit lines). The app builds and `npm test` passes. The screens were not clicked through in a browser; test a real save on your Supabase first.

## Step 5 – Marks: configurable structures per semester, entry, results
- Added: `supabase/migrations/008_step5_marks.sql`, `src/lib/marksEngine.js`, `src/lib/marksData.js`, `tests/marksEngine.test.js`, `src/pages/marks/` (MarksLayout, MarksParts, EntryPage, ResultsPage, StructuresPage, StructureEditor)
- Edited: `src/App.jsx`, `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/lib/roles.js`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `package.json`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `008_step5_marks.sql` (once, after 001-007). It stops with a message if the old `marks` or `assessment_types` tables already contain rows.
- What changed:
  - **Two semesters, each with a final exam.** Every mark structure belongs to one semester of a subject and grade (optionally one stream) and must include a final-exam assessment. The yearly average is the mean of the two semester results (as percents).
  - **Structures:** groups (code, convert-to, multiplier) with assessments (raw maximum). Groups must add up to the final maximum, or a custom formula (`+ - * /`, brackets, MIN, MAX, group codes and `CODE_RAW`) is used. Rounding once at the end, half up. Presets, copy to other subjects or the other semester, copy a whole year.
  - **Marks entry grid:** type and leave the cell to save; marks above the maximum are refused; clearing a cell removes the mark; live totals; finalize and reopen per section, subject and semester.
  - **Results:** per subject (semester 1, semester 2, yearly average, pass or fail) and an all-subjects view. Missing marks are never counted as zero.
  - **Database rules:** teachers only for their own subject and section; closed years read-only; a maximum cannot be lowered below an entered mark; school settings `pass_mark` (50) and `yearly_rounding_places` (1).
- After running: set up one structure for one subject, enter a few marks as a teacher, and check the result. `npm test` runs the calculation tests.
- Known limits: the pass mark of 50 percent is a default still to be confirmed; browser checks were done against a mock backend, so test a real save on your Supabase first; no report cards or printing yet (later step).

## Step 4 – Students: registration, enrollment, section allocation, import
- Added: `supabase/migrations/007_step4_students.sql`, `src/lib/studentCode.js`, `src/lib/studentForm.js`, `src/lib/age.js`, `src/lib/allocation.js`, `src/lib/importer.js`, `src/lib/sectionNames.js`, `src/components/EcDatePicker.jsx`, `src/pages/students/` (StudentsLayout, StudentListPage, RegisterPage, StudentParts, StudentProfilePage, ImportPage, AllocationPage)
- Edited: `src/App.jsx`, `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/lib/ethiopian.js`, `src/lib/roles.js`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `package.json`, `package-lock.json`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `007_step4_students.sql` (once, after 001-006). Then run `npm install` (a new library, `read-excel-file`, reads .xlsx files).
- What changed:
  - **Student ID** like `HMM-2019-7QK4M-X`: random, with a check character; generated by the database; cannot be changed.
  - **Registration** in six steps with review; saves the student, guardians and enrollment together or not at all (`register_student`). Required fields and entry rules are enforced in the database. Date of birth is entered in the Ethiopian calendar.
  - **Warnings that never block:** possible duplicate student, unusual age for the grade (limits in `school_settings` key `age_limits`).
  - **Student list** (search by name or ID, filters, pages of 50, cards on phones) and **student profile** (personal data, guardians, documents, yearly enrollment history, section moves, status change).
  - **Enrollment rules in the database:** one enrollment per student per year; Grades 9-10 no stream, Grades 11-12 need a stream; section must match year, grade and stream; optional section capacity is enforced; the director and vice director can change a stream only (`change_student_stream`).
  - **Section allocation board:** propose, review, move (drag or menu), approve; new sections are created only if used; all-or-nothing save (`apply_section_allocation`).
  - **Import** of existing students (Grades 9-12) from CSV or .xlsx with preview, per-row all-or-nothing saving (`import_students`) and a results file with the new IDs.
- After running: register one test student, open the profile, and try the allocation board with a few students before importing real data.
- Known limits: no photo upload (later); the enrollment history is a table, not a timeline; a section capacity of zero is not allowed, leave it empty for no limit.

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
