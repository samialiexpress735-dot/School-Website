# Changelog

Newest first. "Run SQL" means paste the file into the Supabase SQL Editor and run it once.

## Step 7A, fourth update – a faster form designer (workspace, column types, delete and undo)
- Edited: `src/pages/reports/TemplateDesignerPage.jsx`, `src/styles.css`, `src/i18n/en.js`, `src/i18n/am.js`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Added: nothing. Delete: nothing.
- Run SQL: none. No database change, no new library, no change to the saved layout.
- What changed:
  - **One workspace.** A top bar that stays in view (tools, page switch, Undo, Redo, test print, replace form, Save). The year, grade, stream, section and student are now at the top instead of below the form. The subjects and student-information list is on the left, the settings of the selected item, the warnings and the list of placed items on the right; both stay in view while scrolling. The form can be zoomed.
  - **Column type before drawing.** One Column tool with a list of types (Semester 1, Semester 2, Yearly average, Pass/Fail) instead of a type chosen after drawing. The rectangle and the finished column show the type by colour and a short label. After a column the next missing type is ready, so the four can be drawn one after another.
  - **Delete and undo.** A ✕ on the selected item, a Delete button at the top of the right panel, the Delete key, a ✕ on every placed subject, field and list entry, and Undo / Redo (buttons, Ctrl+Z, Ctrl+Y) for the unsaved layout. Keys V, T, C choose the tools; Esc stops; arrow keys move the selected item.
  - Section 10 rules applied to the new layout: palette tokens, 44 px controls (the round ✕ on the form is 28 px; the Delete button and key are the 44 px ways), logical properties, no new animation, Amharic line height. New texts exist in English and Amharic.
- After this update: open Reports > School forms, open a form that has its blank form chosen. Pick "Semester 1" in the list next to Column and draw it, then draw the next three; click a subject in the left list and then its ✕; press Delete on a selected box; press Ctrl+Z; choose a section and a student at the top and check the values; save.
- Tested: the app builds and `npm test` passes (80 tests, none added or removed). **Not** tested in a real browser, with a real mouse, in Amharic, on a real form or printer; the earlier browser-simulation checks of the designer are not in the project and were not repeated. Contrast and sizes were set in the style sheet, not measured.
- Next: please try the designer on the school's real blank form in English and Amharic. Decisions for you: (a) is the Amharic wording right? (b) should the Column tool stay on after each column (it does now), or return to Select every time?

## Step 7A, third update – the school's form prints only finalized subjects
- Edited: `src/lib/reportTemplate.js`, `src/pages/reports/formData.js`, `src/pages/reports/FormCards.jsx`, `src/pages/reports/TemplateDesignerPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `tests/reportTemplate.test.js`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Added: nothing. Delete: nothing.
- Run SQL: none. No database change (it reads the existing finalize locks, table `mark_locks`).
- What changed:
  - **A subject that is not finalized prints nothing on the school's form.** A semester box needs that semester finalized for the subject; the yearly average and Pass/Fail need both semesters; the overall average, rank and pass/fail of the year need every subject finalized.
  - **A note above the cards** (not printed) lists the subjects and semesters not finalized yet, so a blank box is explained: \"... not finalized for this section ... Finalize them in Marks > Enter marks.\"
  - **The designer's preview** with a real student follows the same rule, with a short line saying so.
  - Name, ID, year, days absent and the other non-result fields are not affected. The plain built-in card is unchanged.
- After this update: in Marks > Enter marks finalize one subject for a semester, then print the section's cards on the school's form. Only that subject's box for that semester should show a value; everything else that needs a finalized subject stays blank, and the note names what is missing. Finalize the rest and print again.
- Tested: `npm test` passes (79 tests, 7 new for the finalized rule). The app builds. In the browser simulation, the printing check (12 checks) covers some subjects finalized and none finalized, and the designer check (35 checks) still passes. **Not** tested against the real database locks, a real browser or paper.
- Next: the school's real blank report card (PDF or scan) and section 8, item 11. Decision for you: should the plain built-in card also show only finalized subjects?

## Step 7A, second update – the form designer works like the rectangle tool in Paint
- Edited: `src/pages/reports/TemplateDesignerPage.jsx`, `src/lib/reportTemplate.js`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `tests/reportTemplate.test.js`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Added: nothing. Delete: nothing.
- Run SQL: none. No database change (the layout already stores x, y, width and height).
- What changed:
  - **Nothing is added automatically any more.** After you load the form and choose the grade, a list \"Place on the form\" shows the grade's subjects and the student information and totals (name, overall average, rank and so on).
  - **Draw a rectangle:** click a name in the list, then press, drag and release on the form. The rectangle you draw (shown dashed while you drag) is the position and size of that subject row, column or field. Dragging in any direction works; a plain click gives a normal size. After a subject, the next subject without a row is ready.
  - **Draw the subjects table:** one rectangle over the whole table; the subjects that have no row yet are divided evenly inside it, one row each.
  - **Edit the width and height:** drag the corner of any placed item (both change together), or type the width and height in the side panel. Items move in any direction by dragging or with the arrow keys.
  - A single field now keeps the height of its rectangle when printed.
- After this update: open Reports > School forms, open a form, choose the blank form and the grade, click \"Maths\" in the list and drag a rectangle over its line on the form, then try \"Draw the subjects table\", \"Draw a column\" and the student name and overall average, drag a corner to resize, and print a test page.
- Tested: `npm test` passes (73 tests, 4 new for the rectangle rules). The app builds. In a browser simulation with a fake database, 35 checks passed on the new workflow (drawing in every direction, plain click, table rectangle, resize by corner, move, keys, save). **Not** tested in a real browser with a real mouse or on paper; touch screens are not supported by the designer.
- Next: still the school's real blank report card (PDF or scan) to try it on, and section 8, item 11.

## Step 7A – the school's own report card forms
- Added: `supabase/migrations/013_step7a_report_templates.sql`, `src/lib/reportTemplate.js`, `src/lib/formImages.js`, `src/pages/reports/ReportTemplatesPage.jsx`, `src/pages/reports/TemplateDesignerPage.jsx`, `src/pages/reports/FormSheet.jsx`, `src/pages/reports/FormCards.jsx`, `src/pages/reports/formData.js`, `tests/reportTemplate.test.js`, `tests/i18n.test.js`
- Edited: `package.json` and `package-lock.json` (new library `pdfjs-dist`, loaded only when a PDF is chosen), `src/App.jsx`, `src/lib/nav.js`, `src/pages/reports/ReportsLayout.jsx`, `src/pages/reports/ReportCardPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run: `npm install` (once, for the new library). **Run SQL: `013_step7a_report_templates.sql`** in the Supabase SQL editor, once, after 001 to 012. It creates the two template tables with their security rules, the function that saves a version, and the private storage bucket `report-forms`.
- What changed:
  - **Reports > School forms** (administration only): list of forms, "New form", and a designer per form.
  - **Designer:** upload a PDF or scan, place subject rows (first and last line, the rest spread evenly), columns and single fields, move them by dragging or with the arrow keys, set the printer adjustment, see warnings about subjects without a row, preview with a real student, print a test page, save as a new version.
  - **Reports > Report cards:** prints on the school's form when the grade has one ("Print on" lets you choose the plain card); a missing mark leaves the box blank, never a zero.
  - **Security:** only the system admin, director and vice director create forms and versions; every role with a login can read them; versions and page images can never be changed or deleted; the bucket is private.
  - A test now checks that every English text has an Amharic text and the same {placeholders} (all existing texts already did).
- After this update: log in as an administrator, open Reports > School forms, create a form for your grades, choose your blank report card (PDF or scan), click the first and last subject line, add the Semester 1, Semester 2 and Average columns, add the name, ID and rank fields, preview with a student, print a test page and hold it against the blank form, adjust, and save. Then open Reports > Report cards for a section of that grade and print. Check it on the real paper. Also check as a teacher that the School forms tab is not shown.
- Tested: `npm test` passes (69 tests, 14 new). The app builds. On PostgreSQL with stand-ins for the Supabase parts, 29 database checks passed (who may create and save, bad layouts refused, versions and images cannot be edited or deleted, audit log). In a browser simulation with a fake database, the designer workflow (25 checks) and printing two students on a two-page form (9 checks) passed. **Not** tested: a real PDF or scan, a real browser, a real printer, the real Supabase storage, Amharic text on paper.
- Known limits: the printed batch does not list students affected by a subject without a row; only yearly forms are used when printing; no "shift" field; the designer is for a computer.
- Next: send the school's real blank report card (PDF or scan, front and back) so the designer can be tried on it, and answer section 8, item 11 (extra boxes, which grades share a form, paper size, conduct and remarks).

## UI v2, Part E – phone and Amharic polish
- Added: `tests/stackTables.test.js`
- Edited: `src/pages/staff/StaffListPage.jsx`, `src/pages/staff/AssignmentsPage.jsx`, `src/pages/staff/StaffFormPage.jsx`, `src/pages/marks/ResultsPage.jsx`, `src/pages/marks/EntryPage.jsx`, `src/pages/marks/StructureEditor.jsx`, `src/styles.css`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No database change. No new texts, so no change to the language files.
- What changed:
  - **Cards on phones:** staff list, teacher assignments (both tables) and Marks > Results (both views) become cards below 720 px, like the student list.
  - **Sticky action bar below 640 px:** Back/Next/Save on registration, Save on the staff form, Save/Delete in the structure editor, Finalize/Reload on the marks grid.
  - **Touch targets of 44 px** on phones and touch screens: the "Move to" menu, mark cells, table and breadcrumb links, the close button of messages, checkboxes.
  - **Amharic:** long labels wrap in buttons, tabs, pills, menu and tiles; looser line height; smaller status buttons on a phone.
- After this update: on a phone (or a narrow window), in English and Amharic, open Staff, Staff > Teacher assignments, Marks > Results, the registration form, the marks grid and the allocation board; check that nothing is cut off, the bottom bars stay in reach and every button is easy to tap.
- Tested: `npm test` passes (55 tests, 2 new: every cell of a card table has a label, and the three tables use the card layout). The app builds. **Not** viewed in a real browser or on a phone, and not on an old computer.
- Next: Part F waits for the school's logo and official colors (section 8, item 6). Other open work: the report card template designer (4.8.1, needs the school's blank form), Step 9 (timetable and per-period attendance) and Step 10 (public website).

## UI v2, Part D – remaining animation and shaped loading placeholders
- Added: `src/lib/motion.js`, `tests/motion.test.js`
- Edited: `src/lib/ui.jsx`, `src/components/Shell.jsx`, `src/pages/attendance/RollCallPage.jsx`, `src/pages/marks/EntryPage.jsx`, `src/pages/students/AllocationPage.jsx`, `src/pages/students/StudentListPage.jsx`, `src/pages/reports/RosterPage.jsx`, `src/styles.css`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No database change. No new texts, so no change to the language files.
- What changed:
  - **Language switch:** a quick cross-fade of the page text; the page is not reloaded, so a half-filled form stays.
  - **Roll call:** smoother color change between statuses; the counts nudge when they change; one gentle pulse for a student who has just reached the absence limit.
  - **Marks grid:** a cell above its maximum flashes terracotta once; totals, result and class average count to the new value.
  - **Allocation board:** cards glide to their new column; student counts count to the new number; a column that becomes unbalanced pulses once.
  - **Loading:** table, card and form shaped placeholders (student list, roster, roll call, marks grid, allocation board).
  - Everything is switched off by "reduce motion"; counting numbers are read out by screen readers as their final value only.
  - **Documentation repair:** the report card and public website revision had been made on an older copy of the blueprint and changelog and had dropped the Part C notes. They are restored here (Part C section 11.5 "As built", the Part C changelog entry, and the progress lines).
- After this update: open the roll call, change a few students and watch the counts; save a student up to the absence limit and look for the single pulse; in the marks grid type a mark above the maximum, and change a valid mark and watch the totals; on the allocation board move students by drag and by the "Move to" menu; switch language on a half-filled registration form; try the whole thing once with the system's "reduce motion" setting on (nothing should move).
- Tested: `npm test` passes (53 tests, 7 new for the count steps, the pulse and glide logic). The app builds. A browser simulation (jsdom) rendered the new loading shapes, the nudge (not on first show, yes after a change) and the counting number (starts as is, moves, ends exactly on the new value, screen reader text is the final value). It was **not** run in a real browser: the gliding of cards and the pulses depend on real layout, which the simulation does not have, so they, and the look on a phone and an old school computer, still need your check.
- Next: Part E (phone and Amharic polish), after you have tried Part D.

## Blueprint revision – report card templates and public website plan
- Added: nothing
- Edited: `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No application code or database changed.
- What changed:
  - **4.8.1 Report card templates (planned, Step 7A):** upload the school's own blank form, link each printed row to a subject, place single fields, preview and print. Values come from the existing engine; missing marks stay blank; warnings when the form and the subject list differ.
  - **4.11 Public website (planned, Step 10):** no sign-in or sign-up; pages and features; results lookup with student ID plus a school-issued PIN (hash stored, only published results, attempt limits); admissions pre-registration; contact form.
  - **Publisher permission:** the director, vice director and staff they choose can publish public content; the system admin cannot.
  - Roles (section 3), safety (4.10), tables (5), build phases (6), decisions (7) and open questions (8, items 11 to 13) updated. Parent and student logins removed from the plan.
- After running: nothing to run. Please answer section 8, items 11 to 13, starting with the report card PDF.
- Known limits: planning only; hosting (undecided) affects good web addresses and per-visitor limits on the public site.

## UI v2, Part C – dialogs, saved-row highlight, unsaved changes and clearer errors
- Added: `src/components/Dialogs.jsx`, `src/lib/rowflash.js`, `tests/rowflash.test.js`
- Edited: `src/App.jsx`, `src/lib/ui.jsx`, `src/styles.css`, `src/i18n/en.js`, `src/i18n/am.js`, `src/pages/marks/EntryPage.jsx`, `src/pages/marks/StructureEditor.jsx`, `src/pages/reports/PromotionPage.jsx`, `src/pages/staff/DepartmentsPage.jsx`, `src/pages/staff/StaffFormPage.jsx`, `src/pages/structure/CalendarPage.jsx`, `src/pages/structure/SectionsPage.jsx`, `src/pages/structure/SubjectsPage.jsx`, `src/pages/structure/YearsPage.jsx`, `src/pages/students/RegisterPage.jsx`, `src/pages/students/StudentParts.jsx`, `src/pages/students/StudentProfilePage.jsx`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No database change.
- What changed:
  - **Styled dialogs** replace all 13 plain browser confirm windows (delete section, calendar entry or guardian; close year; finalize or reopen marks; save or delete a mark structure; remove a login; change stream or status; create many sections; approve promotion). Each one names the action, says what changes, and has a button worded as the action. Dangerous ones start on Cancel. Escape or a tap outside cancels; focus stays in the dialog and returns afterwards.
  - **Unsaved changes:** the registration form and the mark structure editor ask before a link inside the app (or closing the tab) loses typed data. Switching language does not ask.
  - **Saved-row highlight:** an added or changed row glows gold for two seconds on academic years, calendar, subjects, sections and departments.
  - **Messages:** errors have a close button and stay until closed. In registration step 1, names, sex and date of birth show their message under the field and focus moves to the first problem. The marks grid shows a green ring on a saved cell and a clear warning while any mark is not saved.
  - English and Amharic texts for everything new. The Amharic wording is new and should be read by a native speaker.
- After this update: try deleting a calendar entry or a section and cancel with Escape; finalize marks; start registering a student, type a name and click a menu item (you should be asked), then try the same with a language switch (you should not). Check the dialog on a phone in both languages.
- Tested: `npm test` passes (46 tests, 5 new for the row highlight logic). The app builds; every dialog and message text exists in English and Amharic with the same placeholders. A browser simulation (jsdom, with a stand-in for the database) checked the real app: the delete dialog (alertdialog role, red primary button named for the action, focus on Cancel, Escape and Cancel delete nothing, focus returns to the opener, Tab stays inside, Confirm deletes), registration (inline errors, `aria-invalid` and linking, focus on the first problem, the message disappears when fixed, the leave-page dialog with Stay and Leave, no prompt when switching language or when the form is untouched), a failed save (error stays after 5 seconds and the close button removes it), and the highlight hook (no flash on first load or filter change, flashes changed and added rows, goes away). It was **not** run in a real browser: the look of the dialog on a phone, the gold highlight and the Back-button behaviour still need your check.
- Next: Part D (the remaining animation) and Part E (phone and Amharic polish), after you have tried Part C.

## UI v2, Parts A and B – sidebar, breadcrumbs and role dashboards
- Added: `src/components/NavIcon.jsx`, `src/components/Breadcrumbs.jsx`, `src/lib/nav.js`, `src/lib/recent.js`, `src/lib/dashboard.js`, `src/lib/dashboardData.js`, `tests/nav.test.js`, `tests/dashboard.test.js`
- Edited: `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No database change.
- What changed:
  - **Part A, navigation:** a sidebar with icons replaces the row of tabs at the top. On phones and tablets it is a drawer opened by a menu button. The menu shows only what the role can use (Staff is hidden from teachers). A breadcrumb line shows where you are (Dashboard > Students > Register student) and a "Skip to content" link appears on the first Tab. Printing hides the sidebar and breadcrumb.
  - **Part B, dashboard:** under the welcome banner: **At a glance** tiles (students, sections, active staff, absent today, and for the system admin accounts without a role; a teacher sees only their own), **What would you like to do?** shortcuts for each role (for example roll call and marks for teachers, register a student and section allocation for the registrar, promotion for the director), **Recently opened** pages, and the modules list. Friendly empty states with one action when there is no current academic year, no students yet, or a teacher has no section yet.
  - English and Amharic texts for everything new. The Amharic wording is new and should be read by a native speaker.
- After this update: open the dashboard as a teacher, the registrar and the director; check the menu items, the shortcuts and the tiles; open a student's page and check the breadcrumb; on a phone, open and close the menu.
- Tested: `npm test` passes (41 tests, 10 new for menu by role, breadcrumbs, recent pages, shortcuts, tiles and empty states). The app builds. Every new English and Amharic key exists in both languages. A browser simulation (jsdom, with a stand-in for the database) rendered the real app and checked: the teacher menu has no Staff, tiles and shortcuts per role, the three empty states, the Amharic menu and shortcuts, the breadcrumb on Students > Register student, the active menu item, the recent-pages list, and the drawer (menu button opens it, Escape and the dark area close it), with no console errors. It was **not** run in a real browser: the look of the sidebar, the drawer on a real phone, spacing and the new motion still need your check, in English and Amharic.
- Next: Part C (styled dialogs, saved-row highlight, inline errors) after you have tried A and B.

## Blueprint update – UI v2 plan (user-friendly interface and animation)
- Added: nothing
- Edited: `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: none. No application code or database changed.
- What changed: Step 8 (testing) is recorded as done by the school owner. New **section 11, UI v2 plan**, in six parts: A navigation and orientation (left sidebar, role-aware menu, breadcrumbs, skip link), B "my work" dashboard per role (shortcuts, stat tiles, empty states), C feedback and safety (styled dialogs instead of the browser confirm window, saved-row highlight, inline errors, unsaved-changes warning), D animation (CSS only, same rules as 10.6), E phone and Amharic polish, F branding and print polish (when the logo is decided). It also lists acceptance checks and four questions for the school owner (11.10). The progress line, the step table (section 6), the decisions list (section 7) and 10.8 point to it.
- Next: answer the questions in 11.10, then Parts A and B are built as the first UI v2 update.

## Step 7 – Reports, report cards and year-end promotion
- Added: `supabase/migrations/012_step7_promotion.sql`, `src/lib/reports.js`, `src/lib/reportsData.js`, `tests/reports.test.js`, `src/pages/reports/` (ReportsLayout, ReportsParts, RosterPage, ReportCardPage, SheetsPage, PromotionPage)
- Edited: `src/App.jsx`, `src/components/Shell.jsx`, `src/pages/DashboardPage.jsx`, `src/lib/roles.js`, `src/i18n/en.js`, `src/i18n/am.js`, `src/styles.css`, `README.md`, `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`
- Delete: nothing
- Run SQL: `012_step7_promotion.sql` (once, after 001-011). It only adds one function; no existing data is changed.
- What changed:
  - **Reports** in the main menu with four tabs: **Section roster** (yearly average per subject, overall average, rank, pass or fail, class averages), **Report cards** (one student or the whole section, one page per student, printed from the browser in the page language), **Subject sheets** (one subject in one section with rank, highest, lowest, class average, number passed) and **Promotion**.
  - **Promotion rule (decided):** overall yearly average at or above the pass mark moves up (Grade 12 graduates); otherwise the student repeats. The screen suggests, the director, vice director or system admin approves. Students with missing marks get no suggestion.
  - **Database:** new function `apply_promotions` saves a whole group of decisions all or nothing. It creates the new-year enrollments (no section yet; Grade 10 to 11 needs a stream), marks Grade 12 graduates, writes the `promotions` rows and is audited.
  - **Not included (by decision or later):** export to Excel or PDF (skipped), changing a saved decision, a two-language card.
- After running: sign in as the director, open **Reports > Promotion**, choose the old and new year and a grade, check the table and approve; then sign in as the registrar and place the new students on **Students > Section allocation**. Before that, make sure the new academic year exists (School structure > Academic years).
- Tested: SQL 001 to 012 run in order on a local PostgreSQL. `apply_promotions` was checked as a teacher and a registrar (both refused), with an earlier target year (refused), with a Grade 10 student without a stream (refused and nothing else in the same call saved), Grade 11 graduating and Grade 12 moving up (refused), a full valid batch (3 moved up, 2 repeating, 1 graduated; streams, statuses and no section as expected), and a second decision for the same student (refused); 6 promotion rows and 6 audit lines. `npm test` passes (31 tests, 6 new for ranking, suggestion, incomplete students and averages). The app builds, and every new English and Amharic text key exists in both languages. The screens were **not** clicked through in a real browser or on a phone, and printing was not tried: test Roster, Report cards (print preview) and Promotion on your Supabase first. The Amharic wording is new and should be read by a native speaker.

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
