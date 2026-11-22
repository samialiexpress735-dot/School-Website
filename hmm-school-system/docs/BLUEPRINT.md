# Haile Mariam Mamo Secondary School – System Blueprint

ሀይለ ማርያም ማሞ ሁለተኛ ደረጃ ትምህርት ቤት · ደብረብርሃን (Debre Birhan)

Version 1 · Phase 1: School Administration System

**Progress:** Steps 0 (skeleton, login, languages), 1 (database and security), 2 (school structure) and 3 (staff and teacher assignments) are done. The **UI foundation update** (section 10) has been applied to the existing screens. **Step 4 (students, yearly enrollment, section allocation and import) is done** (update `007_step4_students.sql`). Step 5 (configurable marks) is next.
**Steps 1 to 3 brought in line with the decisions update (update `006_blueprint_sync.sql`):** subject lists per grade and stream are now kept per academic year; the draft subject list is reconciled with section 4.5; the starting subject structure is loaded for the current year; section creation has no fixed limit and no default capacity; the sections table shows the real homeroom teacher; the absence threshold (5 per semester) is stored as a setting.
**Blueprint revision (decisions update, before Step 4):** subjects by grade and stream are configurable data per academic year (Amharic in every stream of Grades 11 and 12); marks use a flexible, administrator-configured assessment engine instead of one fixed formula; there is no fixed number of sections; the absence threshold is confirmed as 5 absences per semester; hosting and the school's final branding (logo, official colors) are undecided (TBD); a working UI plan with a proposed palette and planned animations is added as section 10. No application code or database changed in this revision.
**Change from v1 text:** "Homeroom Teacher" is not a separate login role. A homeroom teacher is a teacher who is set as the homeroom of a section (`sections.homeroom_staff_id`), and gets read access to that section.

## 1. Goal and scope

Build a bilingual (English default, Amharic) school management system first, and the public website second. Phase 1 covers administration only: staff, students, sections, marks, attendance and reports. News, gallery, admission forms, results lookup and parent or student logins come after Phase 1.

Grades: 9, 10, 11, 12. Grades 11 and 12 can have a Natural Science or Social Science stream.

## 2. Technology

| Part | Choice | Why |
|---|---|---|
| Front end | React with Vite, built as static files | Runs on any host, including basic Ethio Telecom hosting |
| Database and login | Supabase (PostgreSQL + Auth) for testing | Free tier, real database, built-in security rules |
| Code storage | GitHub repository | Every change saved and reversible |
| Languages | Built-in English and Amharic, no Google Translate | Professional, consistent wording |
| Font | Noto Sans Ethiopic | Clean Amharic display |

**Hosting is not decided (TBD).** Nothing in this blueprint should be read as a final hosting choice. Ethio Telecom is one possibility among others. The project is kept portable so it can be deployed to the eventual host without major architectural changes: the front end is plain static files, and the database structure lives in SQL files, so the database can be moved later (for example from Supabase to a VPS) cleanly.

## 3. Users and roles

| Role | Can do |
|---|---|
| System Admin | Everything, manage users, backups, settings |
| Director | View all data, approve promotions, view all reports |
| Vice Director | Same as Director, limited by assigned duties |
| Unit Leader | View teachers, subjects and marks, and lock finalized marks. **Cannot assign teachers.** |
| Registrar | Register students, manage enrollment, sections, transfers |
| Teacher | Enter marks and attendance only for assigned subjects and sections |

Student and parent logins are added in a later phase. Every user sees only what their role allows (enforced in the database, not just the screen).

## 4. Phase 1 modules

### 4.1 Academic year and semesters
- Academic years use the Ethiopian calendar (for example 2019 E.C.), with the Gregorian year stored alongside.
- Two semesters per year. One year is marked as current.
- Closed years become read-only so old records cannot be changed by accident.
- **School calendar:** school days are **Monday to Friday**. Public holidays, exam days and breaks are stored per year; no attendance is taken on those days and they are never counted as absences. (Built in Step 2.)

### 4.2 Staff registration
- Teaching and **non-teaching** staff (librarian, lab assistant, office and so on) are both registered. Non-teaching staff cannot be assigned to teach.
- Full name (English and Amharic), sex, date of birth, phone, email, address
- Employee ID (typed by the school), staff type, job position, department, qualification, field of study, hire date, employment status (active, on leave, transferred, resigned, retired)
- **Photo:** the field exists, but uploading photos needs file storage and comes in a later update.
- **Login accounts:** the account is created in Supabase (Authentication > Users). The **system administrator** then links it to the staff record in the app and sets the role. Only the system administrator can link accounts or change roles. Unlinking removes the person's access.
- Each department has one unit leader, set on the Departments tab.

### 4.3 Student registration
Every required field is validated before saving.

**Student:** full name in English (first, father, grandfather; required) and in Amharic (optional), sex, date of birth, place of birth, nationality, mother's full name (optional), health condition or disability (optional), student ID (auto-generated), date of admission. **Religion is not asked.** Photo upload is not part of Step 4 (later update).

**Date of birth is entered in the Ethiopian calendar** (day, month including Pagume, year). The system converts it and stores the standard date; both dates are shown. The conversion is tested over every day from 1960 to 2060 E.C. including leap years.

**Student ID (decided by the school owner):** generated by the database, never typed and never changed. Format: `HMM-<registration year E.C.>-<5 random characters>-<1 check character>`, for example `HMM-2019-7QK4M-X`.
- The 5 characters are random (not a counter), so one ID cannot be guessed by adding 1. They use an alphabet without look-alike characters (no 0, O, 1, I, L).
- The last character is a check character calculated from the others, so a mistyped ID is detected (every single-character mistake and every swap of two neighbouring characters is caught). The student list warns when a typed ID fails the check.
- The ID only identifies a student. Security comes from login and database rules, not from the ID being secret.

**Address and contact:** region, zone, woreda, kebele, house number, phone.

**Parent or guardian (at least one required):** full name, relationship, phone, occupation, address; plus mother's name and an emergency contact.

**Previous education:** previous school, last grade completed, transfer certificate number (if transfer), Grade 8 national exam result (for Grade 9 entrants).

**Other:** documents received (birth certificate, transfer letter; photo later).

**Required at registration (enforced on screen and in the database):** the three English names, sex, date of birth, and at least one guardian with a name, a relationship and at least one guardian phone number. For a **new Grade 9 entrant**: the previous school and the Grade 8 exam result (0 to 100). For a **transfer student**: the transfer certificate number and the last grade completed. Address fields are optional. Registration saves the student, guardians and enrollment together or not at all.

**Warnings that never block:** (1) a student with the same three names and date of birth already exists (the registrar must confirm it is a different student); (2) the age at the start of the academic year is unusual for the grade. Default limits (changeable in `school_settings`, key `age_limits`): Grade 9 under 13 or over 20, Grade 10 under 14 or over 21, Grade 11 under 15 or over 22, Grade 12 under 16 or over 23.

**Registration form:** six steps with a progress bar and a review before saving: 1 Student, 2 Address and contact, 3 Guardians, 4 Previous education, 5 Other and documents (with the optional "enroll now" choice of year, grade, stream, status and section), 6 Review. A guardian already in the system (found by phone number) can be reused for a sibling.

### 4.4 Yearly enrollment (how years are stored)
A student is registered once, then **enrolled each year** in a separate record containing: academic year, grade, section, stream (Grades 11 and 12), status (new, promoted, repeater, transfer in, withdrawn, graduated). Marks and attendance link to the enrollment, so a student's full history across years is always preserved and nothing is overwritten.

Example: one student record (Samuel Biniyam) with three enrollments: 2026/27 → Grade 10 → Section A; 2027/28 → Grade 11 → Natural Science → Section B; 2028/29 → Grade 12 → Natural Science → Section A. A new year adds a new enrollment; earlier enrollments are never edited to reflect the new year.

**Streams (Grades 11 and 12):** every Grade 11 and 12 enrollment must carry a stream, **Natural Science** or **Social Science**, chosen or allocated at enrollment time. The stream is stored on that year's enrollment, not on the student, so the historical stream of every year is preserved and a student is not assumed to stay in the same stream forever. Grades 9 and 10 have no stream.

**Stream rules in the database:** Grades 9 and 10 cannot carry a Natural or Social Science stream; Grades 11 and 12 must. The **registrar** chooses the stream at registration or enrollment. The **director and vice director** can change a stream afterwards (they can change nothing else on the enrollment); changing a stream removes the student from the current section so the student is placed again. A section must match the enrollment's year, grade and stream, and an optional section capacity is enforced.

### 4.5 Grades, sections and subjects
- Grades 9 to 12, each with sections (A, B, C and so on). A section capacity is an optional, configurable value; no permanent capacity is fixed in this blueprint.
- **Subject catalogue is configurable data, per academic year.** Subjects, and which subjects are active for each grade and stream in a given academic year, are entered by the system administrator as data. Nothing about the subject list is hard-coded in logic, because curriculum structures change. The national Ministry of Education framework divides Grades 11 and 12 into Natural Science and Social Science streams and includes Amharic in the language structure, and Amharic textbooks exist for Grades 11 and 12; the HMM system treats this as the starting point, not as a permanent national list.
- **Starting subject structure (the school can change it each year):**
  - **Grades 9 and 10:** English, Amharic, Mathematics, Physics, Chemistry, Biology, Geography, History, Economics, Citizenship Education, Information Technology (IT), Health and Physical Education (HPE).
  - **Grades 11 and 12, Natural Science:** English, Amharic, Mathematics, Physics, Chemistry, Biology, Information Technology (IT), Agriculture, and Health and Physical Education (HPE) if the school's configured curriculum includes it.
  - **Grades 11 and 12, Social Science:** English, Amharic, Mathematics, Geography, History, Economics, Information Technology (IT), and Agriculture and Health and Physical Education (HPE) if the school's configured curriculum includes them.
  - **Amharic is available in both Grade 11 and Grade 12, in both Natural Science and Social Science.** It is ordinary configured data like any other subject, not a special case for one stream.
- **Draft in the database, reconciled (done in `006_blueprint_sync.sql`):** the draft list in `supabase/migrations/003_seed_data.sql` predated this decision. Update 006 renames Civics and Ethical Education to Citizenship Education, Physical Education to Health and Physical Education (HPE), and ICT to Information Technology (IT); adds Agriculture; and switches off (does not delete) Business and Technical Drawing. The old SQL file was not edited. The subject list of each grade and stream is stored per academic year (`grade_subjects.academic_year_id`), and a new year can copy another year's lists on the Subjects screen.
- **Starting structure loaded:** for the current year, only the subjects stated without conditions are loaded, and only for a grade and stream that had no subjects set yet. HPE and Agriculture for Grades 11 and 12 (Agriculture for Social Science, HPE for both streams) are not loaded until the school confirms them (section 8, item 2). Periods per week are left empty for the administrator to enter.
- **Section allocation as built in Step 4:** on the allocation board the registrar chooses the year, grade, stream (Grades 11 and 12) and shift, optionally enters a target number of students per section (the system suggests a number of sections), and presses "Propose allocation". Students are dealt out from the highest Grade 8 result downward to the section with the fewest students, then the fewest of the same sex, then the lowest total of results; sections at capacity are skipped. The registrar can keep students who already have a section, move students by drag or by the "Move to" menu, and then approves. Saving creates only the new sections that end up with students and moves all students in one step; if any section would exceed its capacity, nothing is saved. Every move is recorded in the audit log.
- **Section allocation has no fixed maximum number of sections.** The number of sections is worked out from the number of enrolled students in that grade, stream and shift, and from the school's configured balance rules. The allocation process: (1) estimate a sensible number of sections and distribution; (2) balance students reasonably across those sections (for example by sex and previous results); (3) apply the configured school rules; (4) show the proposal to the Registrar or administrator for review; (5) let them move students between sections manually; (6) save the final approved allocation. The system avoids absurd results such as one student per section unless an administrator explicitly chooses that arrangement. The exact capacity and balance rules are configurable and are not fixed in this blueprint yet.
- **Two shifts:** every section belongs to a shift, **morning** or **afternoon**. The school is mainly single shift today, but the system supports both from the start, so section "A" can exist in each shift. Each shift has its own roll call. (Built in Step 2.)
- Teacher assignment: teacher + subject + section + year. One teacher per subject per section; a teacher may be assigned in both shifts.
- Who assigns: **system admin, director and vice director only.** Unit leaders and registrars cannot assign teachers.
- Each section has one **homeroom teacher**, who can see all marks and attendance of that section but enters marks only for the subjects they teach.
- A teacher sees only their assigned sections. If the teacher of a subject changes mid-year, access moves to the new teacher; marks already entered stay, with the name of who entered them.
- Planned screens (Step 3): assignment table per section, teacher workload, "copy last year's assignments".

### 4.6 Marks

**Goal: a flexible assessment-calculation engine** that can represent the school's real marking rules. The system must not assume one universal formula (such as "quiz + assignment + mid-exam + final") for every subject. The administrator defines the assessment structure and the engine interprets it. Structures can differ by subject, by grade and stream, and by academic year.

**The configuration must support:**
- assessment components, each with a name and a raw maximum mark
- component weights (percentage-based weighting)
- groups of assessments (for example a "continuous assessment" group and a "final examination" group)
- raw totals per group
- converted or scaled totals (a raw total converted to another maximum)
- scaling factors (for example a raw maximum of 40 scaled by 1.5)
- direct contribution to the final mark (a component's marks added as they are)
- custom formulas where the above are not enough
- rounding rules
- a configurable final-mark maximum
- different formulas for different subjects, and for different academic years where necessary

**Examples the engine must be able to represent (illustrations, not fixed rules):**
- **A, Biology:** continuous assessment 10 + 15 + 15 = 40; final examination 60; final result 40 + 60 = 100.
- **B, HPE:** continuous assessment 20 + 20 + 20 + 10 = 70; final examination 30; final result 70 + 30 = 100.
- **C, converted and scaled:** continuous assessment 10 + 10 + 10 + 10 + 10 = 50 raw, converted to 40 by the school's rule; final examination with a raw maximum of 40, scaled by 1.5 to 60; final result 40 + 60 = 100.

**Other rules:**
- Teachers enter raw marks per assessment component, for their assigned subjects and sections only; the engine calculates group totals, the semester result and the yearly average from the configured structure.
- A mark can never exceed its component's configured maximum.
- Marks can be locked by the Director or Unit Leader once finalized.
- Every change is recorded (who, when, old value, new value).
- The existing `assessment_types` and `marks` tables came from the earlier, simpler design. How they change to support the configurable structure is decided when Step 5 is planned, and the blueprint is updated first.

### 4.7 Attendance

Attendance is built in two stages: **daily roll call first** (Step 6), then **per-period attendance with live alerts** (Step 9).

**Registering (daily roll call, Step 6)**
1. The section's homeroom teacher opens their section, picks the date (today by default) and the shift is already set by the section.
2. Everyone starts as **present**. The teacher changes only the exceptions to **absent**, **late** or **excused** (with a short note) and saves.
3. Saving again for the same day updates the record; there is never a duplicate. One record per student per day.

**Rules (enforced in the database, not only on screen)**
- Only **Monday to Friday**, and not on holidays or exam days in the school calendar.
- A teacher can register or correct attendance only for the **last 3 school days**. Older dates can be changed only by the system admin, director or vice director, and every such change is logged.
- A teacher can register attendance only for sections they teach or are homeroom of.
- Every change is recorded (who, when, old value, new value).

**Absence threshold (counted by number of absences)**
- **Decided: the threshold is 5 absences per semester.** It is a number, not a percentage, and it is the school's current configured value.
- The threshold stays a configurable setting in case the school changes the rule later; it is not hard-coded.
- Attendance operates by semester, and attendance records are kept as history across semesters and years; closing a semester or year never deletes them.
- Still assumed, to be confirmed: **excused** and **late** do not count as absences.
- The system admin or director sets the school default. A section's homeroom teacher can **change the number for their own section**. The change is logged.
- When a student reaches the number, the student is flagged to the homeroom teacher, unit leader and director.

**Viewing**
| Who | Sees |
|---|---|
| Teacher / homeroom teacher | Their sections only: daily sheet, each student's history, monthly and semester totals |
| Unit leader | All sections (department view is planned) |
| Registrar | All sections, read only |
| Director, vice director, admin | Everything, school-wide summaries by grade, section and shift |

Views and reports: daily sheet per section, student attendance history across years, monthly and semester totals, students at or above the absence number, shift-by-shift summaries. Dates are shown in the Ethiopian calendar and stored as standard dates.

**Per-period attendance with live alerts (Step 9)**
- Needs a **timetable** first (periods, times per shift, which subject in which period). The timetable is built at the start of Step 9.
- Subject teachers register attendance for their own period. The daily roll call stays; per-period records link to the same student and day.
- **Alert 1 (present, then absent):** if a student was present in an earlier period (or the daily roll call) but is marked absent now, the teacher entering the attendance sees an alert on the spot, and the homeroom teacher is told. This helps catch students who leave class.
- **Alert 2 (absent, then present):** if a student was absent earlier but is marked present now, the system flags the earlier absence so it can be corrected or recorded as late, and tells the teacher who marked it.
- Alerts appear instantly in the app and are kept in a notifications list. SMS is not included.

### 4.8 Results and reports
- Student report card (English and Amharic), section roster with rank, subject result sheets
- Pass or fail per subject and promotion decision at year end
- Export to Excel and PDF

### 4.9 Promotion and year rollover
- At year end, promote eligible students to the next grade as new enrollments, with the Director's approval. Repeaters stay in the same grade. Grade 12 completers are marked as graduated.

### 4.10 Security and safety
- Login required for everything in Phase 1
- Role-based access enforced by database rules
- Audit log of important actions
- Student data is never public
- Regular database backup instructions

## 5. Main database tables

(Tables for assessment configuration are redesigned in Step 5, see 4.6; the subject catalogue per academic year is held as data in `subjects` and `grade_subjects`.)

`academic_years`, `semesters`, `profiles` (users and roles), `staff`, `departments`, `students`, `guardians`, `student_guardians`, `grades`, `streams`, `sections`, `subjects`, `grade_subjects`, `teacher_assignments`, `enrollments`, `assessment_types`, `marks`, `attendance`, `promotions`, `audit_log`.

## 6. Build phases

| Step | What we build | Result | Status |
|---|---|---|---|
| 0 | GitHub repo, Supabase project, project skeleton, EN/AM switch, login | Empty app that logs in | Done |
| 1 | Database tables, roles and security rules | Secure database | Done |
| 2 | Academic years, school calendar (Mon-Fri, holidays), grades, **shifts**, sections, subjects | School structure ready | Done |
| 3 | Staff registration, teacher assignments, homeroom teachers | Staff ready | Done |
| 4 | Student registration and yearly enrollment (scope in 6.1) | Students ready | Done |
| 5 | Configurable assessment structures, marks entry and calculations (4.6) | Marks ready | Next |
| 6 | **Daily attendance**, 3-day edit window, absence number (default 5), attendance views | Attendance ready | |
| 7 | Reports, report cards, promotion | Year-end ready | |
| 8 | Testing with real staff, fixes | Test version | |
| 9 | **Timetable, per-period attendance, live alerts** | Period attendance ready | |
| 10 | Public website (news, events, gallery, admissions, results lookup, parent and student logins) | Full site | |
| 11 | Deploy to the chosen hosting (hosting still TBD) | Live | |

### 6.1 Step 4 scope: student registration and yearly enrollment

Step 4 is the next development stage. It covers only:
1. **Student master record** (4.3): registration of a student once, with validated required fields, guardians (at least one), previous education and the auto-generated student ID.
2. **Yearly enrollment** (4.4): one enrollment per student per academic year, with grade, section, stream (Grades 11 and 12) and status. Earlier enrollments are never overwritten.
3. **Stream allocation** for Grades 11 and 12 (Natural Science or Social Science), stored on the enrollment.
4. **Section allocation** (4.5): proposal, balanced distribution, review, manual adjustment between sections, and saving the approved allocation. No fixed number of sections.
5. The data relationships and role access these need (Registrar registers and enrolls; others as in section 3).
6. **Import of students already in the school** (Grades 9 to 12) from a CSV or Excel file, added by decision of the school owner: a downloadable template, Ethiopian dates of birth as dd/mm/yyyy, a preview with errors and warnings per row, each row saved all or nothing, student IDs created automatically, and a results file listing the new IDs.

Step 4 does **not** include marks, attendance, reports, promotion, photo upload, the timetable or the public website. Before coding starts, Claude asks the remaining questions (section 8) and states its assumptions, as in working rule 5.

Each step is delivered as files you commit to GitHub, then tested before the next step. Database changes for a step arrive as a new numbered SQL file (for example `004_...`), run after the earlier ones.

## 7. Decisions made

- Attendance: daily first, per-period with live alerts later (Step 9).
- Two shifts supported (morning, afternoon), default mainly single shift.
- School days Monday to Friday.
- Teachers may edit attendance for the last 3 school days only.
- Absence threshold is a number, default 5, changeable by the homeroom teacher for their section.
- **Unit leaders cannot assign teachers.** Only the system admin, director and vice director can.
- Non-teaching staff are registered too. All teachers have email addresses.
- Accounts are created in Supabase and linked to staff by the system administrator (simple method; email invites may come later).
- Homeroom teachers and teacher assignments are set only by the system admin, director and vice director, and only for active teaching staff.
- A teacher with more than 25 periods per week is flagged. The number can be changed on the assignments page.
- The subject catalogue is configurable data per academic year, not hard-coded. Amharic is available in Grades 11 and 12 for both Natural Science and Social Science.
- Marks use a flexible, administrator-configured assessment engine (4.6), not one universal formula.
- Students are registered once and enrolled every academic year; Grades 11 and 12 store the stream on each year's enrollment.
- No fixed maximum number of sections; allocation proposes a balanced split that the Registrar reviews and adjusts.
- The absence threshold is 5 absences per semester, and stays configurable.
- Student ID: random, non-sequential, with a check character (see 4.3). Date of birth is entered in the Ethiopian calendar. Religion is not asked.
- Required registration fields, the duplicate warning and the age warning are as in 4.3; warnings never block.
- The registrar chooses the stream at registration; the director and vice director can change it later. Existing students of Grades 9 to 12 can be imported.
- Photo upload is skipped for now.
- Hosting is undecided (TBD). The school's final branding (logo, official colors) is undecided; until then the working UI palette and animation plan in section 10 is used.

## 8. Still needed from you

1. Hosting: **undecided (TBD)**. Which provider and kind of hosting (static, PHP, Node.js, VPS) will be used, whether Ethio Telecom or another?
2. Confirm the active subject list for the first academic year, per grade and stream, using the starting structure in 4.5 (including whether HPE and Agriculture apply in Grades 11 and 12), and enter the periods per week. The starting structure is already loaded for the current year by update 006, without those conditional subjects.
3. The real mark structure for each subject (components, maximums, weights, any conversion or scaling, rounding) and the pass mark. The engine in 4.6 is configurable, so this is entered as data, not decided in code.
4. The school's balance rules for sections (target or maximum students per section, if any). There is no fixed number of sections. Until the rules are written here, the registrar enters a target at allocation time, and a section capacity is optional.
5. ~~Student ID format~~ **Decided** by the school owner (see 4.3). If the school later wants a different format, tell Claude and the blueprint is changed first.
6. School logo and official colors: **undecided**. There is no logo yet. Section 10 proposes a working UI palette so the system looks good now; it is not a branding decision and can be replaced later by changing a few color values. Please say if the school already has official colors or a logo to use instead.
7. Who will be the first System Admin?
8. Absence rule: decided as 5 absences per semester. Still to confirm: do excused and late marks stay uncounted (assumed)?

## 9. Working rules (how we deliver and test)

1. **Updates are zips with only added and edited files.** Each zip uses the same folder paths as the project and has **no extra wrapper folder**, so it can be expanded straight into the main project folder, replacing files with the same name. A full-project zip is sent only if you ask for one.
2. **Every update zip includes `docs/BLUEPRINT.md` and `docs/CHANGELOG.md`**, so the plan and the history stay current in GitHub.
3. **`docs/CHANGELOG.md` lists, for each update:** files added, files edited, **files to delete** (uploading cannot remove files, so deletions and renames are listed there), and which SQL file to run.
4. **Database changes come as a new numbered SQL file** (`005_...`, `006_...`). Run only the new file, in order. An SQL file that has already been run is never edited.
5. **Before each step starts, Claude asks the questions it needs** and states its assumptions, so you can correct them before anything is built.
6. **When a step changes the plan**, the blueprint is edited in that same update.
7. **Testing:** SQL changes are tested on a local PostgreSQL before they are sent, and the app is built to check for errors. Screens are tested by you in the browser, and problems are fixed in the next update.

## 10. User interface plan

This section is the plan for how the system looks and feels. It is a **working design direction**, not final school branding. The school has no logo yet, so the interface gets its identity from color, typography and motion. Everything is built from design tokens (CSS variables), so a future logo or official colors can be applied by changing a few values, without redesigning screens. No UI code is changed by this section; it is applied in a later update (timing in 10.8).

### 10.1 Design goals
1. **Calm, clear and trustworthy:** an office tool used daily by registrars, teachers and directors. Beauty comes from good color, spacing and gentle motion, not decoration.
2. **Bilingual first:** English and Amharic look equally good. Amharic keeps looser line height and Noto Sans Ethiopic; layouts must not break with longer Amharic text.
3. **Works on modest hardware:** old school computers, slow connections and phones. No heavy libraries; the app stays static files.
4. **Fast to use:** the most frequent jobs (registering a student, daily roll call, entering marks) need the fewest clicks and large, forgiving controls.
5. **Accessible:** readable contrast, visible keyboard focus, meaning never carried by color alone.

### 10.2 Working color palette (proposed)
Inspired by the Ethiopian highlands around Debre Birhan ("city of light"): deep highland blue, sunrise gold, a fresh teal and warm earth tones. All text and button pairs below were checked for at least 4.5:1 contrast (WCAG AA).

| Token | Color | Used for |
|---|---|---|
| Highland Indigo | `#0f2e4d` | Top bar, headings, primary buttons |
| Sunrise Gold | `#f6c453` | Accent line, active marker, highlights (text on gold is Indigo) |
| Deep Gold (text) | `#7a5300` | Gold-colored text and Ethiopian dates on light backgrounds |
| Meadow Teal | `#0b7a75` | Links, secondary actions, focus of attention |
| Forest | `#1f6b4a` | Present, success, approved |
| Terracotta | `#b8432f` | Absent, errors, danger, warnings |
| Sky Blue | `#2a5d9f` | Excused, information |
| Page | `#f5f7fa` | Page background |
| Warm Cream | `#fbf6ea` | Soft highlighted panels, empty states |
| Text / Muted / Line | `#1b2733` / `#566677` / `#d9e0e8` | Body text, secondary text, borders |

- **Signature gradient:** Indigo to a deep teal (about `#0f2e4d` to `#0b5d63`) for the login panel, the dashboard welcome banner and empty-state art, always with white text.
- **Status colors** (attendance and records) always come with a word or icon as well as the color: present, absent, late, excused; active, on leave, withdrawn.
- Pale tints of the status colors are used as backgrounds (for example a pale terracotta row for a student at the absence threshold).
- Dark mode is **not** planned for Phase 1.

### 10.3 Typography and spacing
- Fonts stay bundled: Atkinson Hyperlegible for English, Noto Sans Ethiopic for Amharic.
- One type scale (small, body, large, heading, page title) and one spacing scale (4, 8, 12, 16, 24, 32, 48 px) used everywhere.
- Rounded corners of 6 to 10 px, soft shadows only on raised things (cards, menus, dialogs), 1 px lines elsewhere.
- Large touch targets (at least 44 px) for buttons, attendance toggles and mark cells.

### 10.4 Layout
- **Now:** top bar with gold underline, main navigation row, sub-tabs per module, content in panels.
- **Planned:** a left sidebar on desktop once there are more than about six modules (after Step 6); it collapses to a menu button on phones. A breadcrumb line shows where the person is.
- **Dashboard:** a welcome banner (signature gradient) with the person's name, role and today's date in both calendars, then module cards. Cards for later steps show a quiet "Soon" badge. Summary figures (students, staff, sections) appear as small stat tiles as each step makes them available.
- **Empty states:** a short friendly message on warm cream with one clear action (for example "No students yet. Register the first student").
- **Loading:** skeleton placeholders shaped like the content, not spinners alone.
- **Dates:** Ethiopian date first, standard date beside it in small deep-gold text, as built today.

### 10.5 Key screens planned (for Steps 4 to 7)
- **Student list:** search, filters (year, grade, section, stream, status), table that becomes cards on phones.
- **Student registration:** a step-by-step form with a visible progress bar: 1 Student, 2 Address and contact, 3 Guardians, 4 Previous education, 5 Other and documents, 6 Review. Each step validates before moving on; progress is not lost when moving back; the review step lists every field before saving.
- **Yearly enrollment and stream allocation:** pick year and grade, choose Natural or Social Science for Grades 11 and 12, with the student's earlier enrollments shown beside it as a timeline.
- **Section allocation board:** one column per section showing its count and balance (for example sex split), student cards that can be moved between columns by drag **and** by a "Move to..." button or keyboard, a "Propose allocation" action, and a clear Approve step. Numbers update live as students move.
- **Daily roll call (Step 6):** everyone starts as present; large toggles cycle present, absent, late, excused; a running count of absences; students at or above the absence threshold are marked clearly.
- **Marks entry (Step 5):** a spreadsheet-like grid following the subject's configured assessment structure, with running totals, a visible maximum per column, and instant red feedback if a mark exceeds its maximum.

### 10.6 Animation plan
Motion is used to explain what happened, never for show. It is **CSS only** (no animation library) and uses only `transform` and `opacity`, so it stays smooth on old computers. Typical duration is 150 to 250 ms with gentle easing. Everything respects the user's "reduce motion" setting (animations are switched off; this is already in the stylesheet).

| Where | Animation | Purpose |
|---|---|---|
| Login page | Gold margin line draws down the ruled page; the ruled lines fade in; the school name rises gently; the form fades in | Memorable first impression, quick (under 1 second) |
| Page change | Short fade and 8 px upward slide of the content | Shows the page changed without a jarring jump |
| Main nav and tabs | The gold underline grows in under the active item; tab pills change color smoothly | Shows where you are |
| Dashboard cards | Staggered fade-in on load; slight lift and shadow on hover or focus | Feels alive, shows what is clickable |
| Buttons | Soft press effect and color change on hover; small spinner inside the button while saving | Immediate feedback |
| Flash messages | Slide in from the top, fade out after a few seconds (errors stay until dismissed) | Confirms saves and errors without blocking |
| Saved rows and records | Brief gold-to-transparent highlight on the row that was just added or changed | Shows exactly what changed |
| Lists and tables | Rows fade in as data loads; skeleton shimmer while waiting | Calm loading |
| Registration form steps | Progress bar fills; the next step slides in from the reading direction | Clear sense of progress |
| Section allocation board | Student card glides to its new column and the counts animate to their new values; a gentle pulse on a column that becomes unbalanced | Makes moves understandable and reversible |
| Attendance toggles | Smooth color change between present, absent, late, excused; the absence counter nudges when it changes; a pulse when a student reaches the threshold | Fast, satisfying roll call and a clear alert |
| Marks grid | A cell flashes terracotta if a mark exceeds its maximum; totals count up or down to the new value | Instant correction |
| Language switch | Quick cross-fade of text when switching English and Amharic (deferred; the page is kept in place on a language switch so a half-filled form is never reset) | Avoids a flash of mixed text |
| Dialogs and menus | Fade and scale from 96 to 100 percent | Soft focus change |

Rules for motion: nothing loops forever; nothing moves while a person is typing; no animation delays a task; sound is not used.

### 10.6.1 Reading direction
Layouts use logical CSS properties (start and end instead of left and right) so any future change in direction or language does not need a redesign.

### 10.7 Accessibility rules
- Contrast of at least 4.5:1 for normal text and 3:1 for large text and control borders.
- Visible focus outline on every interactive element; everything usable by keyboard (including moving students between sections).
- Color is never the only signal; status always has a word or icon.
- Form fields always have visible labels; errors say what is wrong and how to fix it, in the chosen language.
- Respect "reduce motion".

### 10.8 How and when it is applied
- The UI plan is implemented in small, reviewable updates; no database changes are needed for it.
- **UI foundation update (done, before Step 4):** design tokens and the working palette; shared button, panel, table, pill and message styles; page fade-in on every screen change; the animated login page (gold margin line draws down, ruled lines and text fade in); the dashboard welcome banner with today's date in both calendars and staggered module cards; sliding-in navigation underline; flash messages that slide in and "Saved." messages that fade away by themselves; skeleton loading placeholders instead of a plain "Loading..." line; button spinner support (`aria-busy`); the new favicon colors. It touches `src/styles.css` and a few shared components and pages only.
- **Still to come, with the step that needs it:** highlight of a just-saved row, language cross-fade, dialogs and menus, attendance toggles and threshold pulse (Step 6), marks grid feedback and counting totals (Step 5), the left sidebar (after Step 6), stat tiles on the dashboard (as each step provides data).
- **Done in Step 4:** the six-step registration form with progress bar and review, student cards on phones (the student list becomes cards), the section allocation board (drag and the "Move to" menu, live counts), and a step slide-in. Not yet done: a timeline beside the enrollment (the enrollment history is a table), counting animations on the board.
- A future logo or official colors replace the palette by editing the tokens in 10.2; nothing else changes.
