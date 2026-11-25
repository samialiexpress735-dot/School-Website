# Haile Mariam Mamo Secondary School – System Blueprint

ሀይለ ማርያም ማሞ ሁለተኛ ደረጃ ትምህርት ቤት · ደብረብርሃን (Debre Birhan)

Version 1 · Phase 1: School Administration System

**Progress:** Steps 0 (skeleton, login, languages), 1 (database and security), 2 (school structure) and 3 (staff and teacher assignments) are done. The **UI foundation update** (section 10) has been applied to the existing screens. **Step 4 (students, yearly enrollment, section allocation and import) is done** (update `007_step4_students.sql`). **Step 5 (configurable marks, two semesters each ending in a final exam) is done** (update `008_step5_marks.sql`), **including teachers editing the structure of their own subject** (update `009_step5_teacher_structures.sql`). **Step 6 (daily attendance: roll call, 3-school-day edit window, absence limit per section, summaries) is done** (update `010_step6_attendance.sql`, section 4.7 "As built"). A **Step 6 fix** (update `011_step6_fix_semester_dates.sql`) corrects the attendance summary when semester dates were empty (section 4.7). **Step 7 (reports, report cards, promotion) is done** (update `012_step7_promotion.sql`, sections 4.8 and 4.9 "As built"). Step 8 (testing) was done by the school owner. The next stage is the **UI v2 plan** (section 11): navigation, role dashboards, feedback and animation, so the system is user friendly. **Parts A to E of UI v2 are built**; part F (branding, waits for the school's logo) is next. A **design review and polish update** (section 10.9) has been applied on top of the UI foundation. **Step 7A, the school's own report card form designer (4.8.1), is built** (update `013_step7a_report_templates.sql`, section 4.8.1 "As built"); it has not yet been tried on the school's real form. The **public website plan** (4.11) is added but not built; the public site has no sign-in or sign-up, and results are checked with the student ID and a PIN.
**Steps 1 to 3 brought in line with the decisions update (update `006_blueprint_sync.sql`):** subject lists per grade and stream are now kept per academic year; the draft subject list is reconciled with section 4.5; the starting subject structure is loaded for the current year; section creation has no fixed limit and no default capacity; the sections table shows the real homeroom teacher; the absence threshold (5 per semester) is stored as a setting.
**Blueprint revision (decisions update, before Step 4):** subjects by grade and stream are configurable data per academic year (Amharic in every stream of Grades 11 and 12); marks use a flexible, administrator-configured assessment engine instead of one fixed formula; there is no fixed number of sections; the absence threshold is confirmed as 5 absences per semester; hosting and the school's final branding (logo, official colors) are undecided (TBD); a working UI plan with a proposed palette and planned animations is added as section 10. No application code or database changed in this revision.
**Change from v1 text:** "Homeroom Teacher" is not a separate login role. A homeroom teacher is a teacher who is set as the homeroom of a section (`sections.homeroom_staff_id`), and gets read access to that section.

## 1. Goal and scope

Build a bilingual (English default, Amharic) school management system first, and the public website second. Phase 1 covers administration only: staff, students, sections, marks, attendance and reports. News, events, gallery, admissions pre-registration and the results lookup (no public accounts, see 4.11) come after Phase 1. Student and parent logins are **not planned**; the school asked for a site without sign-in and sign-up.

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
| Teacher | Enter marks and attendance only for assigned subjects and sections; edit the mark structure of their own assigned subjects (4.6) |

There are **no student or parent logins**. Results are checked on the public website with the student ID and a PIN (4.11). Every user sees only what their role allows (enforced in the database, not just the screen).

**Publisher permission (planned, 4.11):** like "homeroom", this is not a separate login role. It is a permission that the **director or vice director** gives to a staff member (and can take away) so that person can publish news, events, photos and downloads on the public website. The director and vice director can always publish. **The system admin cannot publish** public content (decided by the school owner).

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
**How Step 5 builds this (decided and delivered):**
- **Two semesters, each with its own final exam.** A structure belongs to one semester of one subject and grade (and optionally one stream). Every structure must have at least one assessment marked as the **final exam**. The yearly average is the mean of the two semester results, each taken as a percent of its own maximum.
- **Structure = groups + assessments.** A group has a code (for example `CA`, `FINAL`), an optional conversion ("raw total converted to 40") and a multiplier ("x 1.5"). A group is worth `raw total / raw maximum x convert-to x multiplier`. The groups must add up to the final-mark maximum, unless a custom formula is set.
- **Custom formula (optional):** uses group codes (`CA`, `CA_RAW` for the raw total), `+ - * /`, brackets, `MIN(` `)` and `MAX(` `)`. It is parsed by the system and never run as code.
- **Rounding** happens once, at the end, half up, to 0, 1 or 2 decimals (per structure). The yearly average uses the school setting `yearly_rounding_places` (default 1).
- **Who does what:** system admin, director and vice director set up structures and can copy them (to other subjects, to the other semester, or a whole year); **an assigned teacher can also create and edit the structure of their own subject** (see the Step 5 update below; copying and the school settings stay with the three administrators). Teachers enter marks only for the subject and section they are assigned to; unit leaders, director and vice director read everything and can finalize; only the director, vice director and system admin can reopen. The system admin can correct a mark in a finalized or locked semester; nobody can change anything in a closed year.
- **Finalizing** is per section, subject and semester. Marks cannot be changed while finalized or while the semester is locked.
- **Pass mark:** a school setting (`pass_mark`, default **50 percent of the final mark**, still to be confirmed by the school, section 8). It applies to every subject.
- **Missing marks** are never counted as zero silently: a result with missing marks is shown in italics as incomplete.
**Step 5 update (built, update `009_step5_teacher_structures.sql`): teachers edit the structure of their own subject.**
- **Who:** a teacher can create and edit the mark structure (groups, assessments, maximums, final exam, formula) of a subject and grade they are assigned to, in the semester they choose. The system admin, director and vice director can still edit every structure. Unit leaders cannot.
- **One teacher per subject per section** (section 4.5) stays a hard rule: the database already refuses a second teacher for the same year, subject and section (unique rule on `teacher_assignments`), so there is never a conflict inside one section. Teachers of different sections of the same subject and grade share one structure; this is accepted, because they teach the same subject and are expected to agree.
- **Test assessments are allowed.** A teacher may create a test assessment and fill it with marks to try it out. Marks in the structure never block editing.
- **Empty assessment (no marks entered):** the teacher can change or delete it freely, with no question asked.
- **Assessment that already has marks:** the teacher can still edit or delete it, but the system first shows a **confirmation dialog** (the same kind as when finalizing marks) that states how many marks and students are affected and what will happen (for example "12 marks will be deleted" when removing, or "results of 40 students will be recalculated" when changing a maximum or conversion). Nothing changes until the teacher confirms. Lowering a maximum below an entered mark is still refused until those marks are corrected, and deleting an assessment deletes its marks only after confirmation.
- **Finalized or locked marks:** a section and semester that is finalized (or a locked semester) cannot be changed through the structure by a teacher. Only the director, vice director and system admin can reopen it first. A closed year is read-only for everyone.
- **Audit:** every structure change, and every confirmed deletion of marks, is recorded in the audit log with the user's name and the number of marks affected.
- **How it was built:** one database function, `structure_edit_status`, decides who may change a structure and returns the reason when not (`ok`, `not_assigned`, `finalized`, `semester_locked`, `closed_year`, `not_allowed`). The write rules of the three structure tables, `save_assessment_structure` and the new `delete_assessment_structure` all use it, so the screen and the database agree. A teacher passes only when assigned to that subject in a section of that year and grade (and stream, for a stream-specific structure). The confirmation dialog is the same kind as when finalizing marks (`window.confirm`) and its numbers come from `structure_mark_counts`, which counts marks across **all** sections (a teacher can only read their own section's marks). Without the confirmation the database refuses to delete marks (`CONFIRM_NEEDED`). Every save adds one audit line with the person's name and the number of marks deleted. `MARK_STRUCTURE_EDITORS` now includes the teacher role and a new `MARK_STRUCTURE_ADMINS` keeps the three administrators for the copy tools and school settings. The pass mark and all school settings stay editable only by the three administrators.
- **"Finalized" for a shared structure:** because teachers of different sections share one structure, a teacher cannot change it once **any** section it covers (same grade, and same stream for a stream-specific structure) is finalized for that subject and semester. The director, vice director or system admin must reopen it first; the administrators themselves are not blocked.
- **Assumption to confirm:** the unit leader role cannot edit structures even when the same person also teaches (the person would need the teacher role). Say if the school wants otherwise.

- The earlier `assessment_types` table was replaced by `assessment_structures`, `assessment_groups` and `assessment_components` (it was empty); `marks` now point to an assessment; `mark_locks` records finalized marks.

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

**As built in Step 6 (daily roll call) - decisions and assumptions**
- **Screens (Attendance):** *Daily roll call* (pick year, section and date; the date has previous and next school day buttons and the Ethiopian date is shown under it), *Summary* (totals per student for a semester) and *Absence limit* (the students who have reached their section's limit). The date itself is chosen with the browser's standard date picker; the Ethiopian date is displayed beside it.
- **Roll call:** everyone starts as present; the teacher changes only the exceptions with large four-way buttons (present, absent, late, excused, always with a word as well as a color) and presses Save. A day that was already taken opens with its saved values. Only changed records are written, and saving the same day again never creates a duplicate. A student who is withdrawn or graduated is not listed.
- **Saved together or not at all:** `save_daily_attendance` saves the whole sheet in one step; if any record breaks a rule, nothing is saved.
- **Fix (update 011):** the summary counts records inside the chosen semester's dates. If those dates were empty, every column showed 0 although the records existed. Now (1) attendance cannot be saved until both semesters have dates, (2) a semester that still has no dates shows the whole-year numbers instead of zeros, and (3) the Roll call, Summary and Absence limit screens show a warning that says where to set the dates. Old records are not changed.
- **Rules in the database (update 010, changed by 011):** Monday to Friday only; not on holidays, exam days or breaks of the school calendar; never a future date; both semesters of the year must have start and end dates, and the date must fall inside one of them (update 011; before it, saving was allowed with empty dates, which made the semester summary show zeros); the student must be placed in a section and not withdrawn or graduated; a closed academic year is read-only for everyone; the student and date of a record can never be changed; records cannot be deleted (except by the system admin); per-period records (with a subject) are refused until Step 9.
- **Who can write:** the system admin, director and vice director can register or correct any school day of an open year (the director and vice director could not write attendance before this update; they can now, as this blueprint always said). Teachers, and unit leaders who also teach, can write only for sections they teach or are homeroom of, and only for the **last 3 school days, today included** (setting `attendance_edit_school_days`, default 3). A holiday or weekend does not use up one of the 3 days. Registrars and other unit leaders can read only.
- **Excused needs a short note** (enforced in the database).
- **Every change is audited** (who, when, old and new value) by the existing audit trigger on `attendance`.
- **Absence limit:** the school default is the setting `absence_threshold` (5). A section can have its own number (`sections.absence_threshold`); empty means the school number. The homeroom teacher of the section, the director, vice director and system admin can change it on the roll call screen; each change is written to the audit log (`ABSENCE_THRESHOLD`). Only **absent** counts; late and excused do not.
- **Flagging:** a student at or above the limit in the semester is shown with a red edge and the words "At the limit" on the roll call, in the Summary, and in the *Absence limit* list. Each person sees the sections their role allows (homeroom and subject teachers their own sections; unit leaders, registrar, director, vice director and system admin all). **This is a list on screen, not a message sent to anyone;** notifications arrive with Step 9.
- **Dates and time zones:** the 3-day window is decided by the database using its own date (Supabase runs on UTC; Ethiopia is 3 hours ahead). The screen mirrors the rule, so around midnight the screen and the database can differ by one day; the database always has the final say and the screen shows its message.
- **Not in Step 6:** timetable and per-period attendance (Step 9), notifications, printing and export, attendance for students who were not in a section.

**Per-period attendance with live alerts (Step 9)**
- Needs a **timetable** first (periods, times per shift, which subject in which period). The timetable is built at the start of Step 9.
- Subject teachers register attendance for their own period. The daily roll call stays; per-period records link to the same student and day.
- **Alert 1 (present, then absent):** if a student was present in an earlier period (or the daily roll call) but is marked absent now, the teacher entering the attendance sees an alert on the spot, and the homeroom teacher is told. This helps catch students who leave class.
- **Alert 2 (absent, then present):** if a student was absent earlier but is marked present now, the system flags the earlier absence so it can be corrected or recorded as late, and tells the teacher who marked it.
- Alerts appear instantly in the app and are kept in a notifications list. SMS is not included.

### 4.8 Results and reports
- Student report card (English and Amharic), section roster with rank, subject result sheets
- Pass or fail per subject and promotion decision at year end
- Export to Excel and PDF (**not built; skipped for now by decision of the school owner**, the screens print instead)

**As built in Step 7 (reports) - decisions and assumptions**
- **Screens (Reports):** *Section roster* (every student with the yearly average per subject, overall average, rank, pass/fail, class averages), *Report cards* (one student or the whole section, one page per student, printed from the browser), *Subject sheets* (one subject in one section with rank, highest, lowest, class average and the number who passed) and *Promotion* (4.9).
- **Calculation:** nothing new is calculated in the database. The screens use the same engine as Marks > Results: each semester result as a percent of its own maximum, the yearly average as the mean of the two semesters, the overall average as the mean of the subject yearly averages, rounded with `yearly_rounding_places`.
- **Rank:** by overall average within the section; students with the same average share a rank (1, 2, 2, 4). A student with no marks at all gets no rank.
- **Missing marks:** a student is **incomplete** when any subject of the grade and stream lacks a semester result, or has no mark structure. Incomplete results are shown in italics, are never counted as zero, and get no promotion suggestion.
- **Language and printing:** a report card is printed in the language of the page (English or Amharic); there is no two-language card yet. Printing uses the browser's print dialog (save as PDF there). There is no Excel or PDF export (skipped by decision).
- **Who sees what:** system admin, director, vice director and unit leaders see every section. A homeroom teacher sees the roster and report cards of their section. A subject teacher sees only the *Subject sheets* of their own subject and section. The database still decides what can really be read.

### 4.8.1 Report card templates (built as Step 7A; see "As built" below)

The school already has its own printed report card form. The current built-in card (4.8) has a fixed layout, so it cannot match that form. This feature lets the school upload its **own blank form** and tell the system **where each value goes**. Decided with the school owner: the subject names are already printed on the form, so the system never prints subject names; it only puts each subject's numbers into the right boxes.

**How it works**
1. **Upload the blank form** (PDF or a clean scan or photo). A PDF is converted in the browser to a background image per page. The PDF itself is never edited.
2. **Mark the columns.** The designer places a column for Semester 1, Semester 2 and Average (and the result, if the form has a box for it). Each column is tied to its value from the system.
3. **Link the rows to subjects.** The person clicks each printed row and picks its subject from the grade's subject list. The designer shows the system's Amharic and English subject name beside the row so the link can be checked against what is printed.
4. **Place single fields:** student name, ID, grade, section, stream, year, shift, homeroom teacher, totals, averages, rank, result, attendance, signature lines and the printed date. Each has a position, font size and alignment.
5. **Fine-tune.** A single box can be nudged; the whole page can be shifted a few millimeters to match the printer.
6. **Preview with a real student**, then save. Printing one card or a whole section uses the same renderer as the preview.

**Rules**
- **Values** come from the same engine as Marks > Results and Reports (4.6, 4.8): each semester result as a percent of its maximum, the yearly average as the mean of the two semesters, rounding by `yearly_rounding_places`, pass or fail by `pass_mark`, rank by overall average within the section (ties share a rank, as in the roster).
- **Missing marks leave the box blank.** A zero is never printed for a missing mark. A subject the student does not take (for example by stream) stays blank.
- **No silent loss.** If a grade has a subject with no row on the form, or a row points to a subject the grade does not have, the designer shows a warning and the printed batch lists the affected students. The subject lists change per year (4.5), so this check runs every time.
- **Scope.** A template is assigned to one or more grades (and streams) and has a kind: Semester 1 card, Semester 2 card, or yearly card, when the school uses different forms. One form can serve several grades because rows are linked by subject; rows with no subject for that grade stay empty. A grade with no template uses the built-in card.
- **Pages.** One or two pages per form (front and back); fields are placed per page. To confirm.
- **Language.** Fields print in the language chosen when printing; Amharic text uses the same font as the screens.
- **Versions.** Each saved layout is a new version. A card printed last year can be reproduced exactly even after the template changes.
- **Who:** the system admin, director and vice director upload and edit templates. Registrars, unit leaders and teachers print only what 4.8 already lets them see.
- **Files:** the blank forms are stored in a **private** storage bucket. Only the roles that can print reports read them. The public website never uses them (a printable card on the public site is a possible later addition, not part of this plan).

**Not included:** editing the PDF itself, automatic detection of cells (the person marks them), Excel export, conduct or teacher remarks (the system does not store them yet; see section 8 for the decision), and a two-language card.

**Data:** `report_templates` (name, kind, grades and streams it serves), `report_template_versions` (layout as data, page image paths, offset), kept in the audit log. SQL file `013_step7a_report_templates.sql`; two new screens under Reports (Reports > School forms).

**As built in Step 7A - decisions and assumptions**
- **Who and where:** Reports > **School forms** (system admin, director, vice director only; the database enforces it). A list of forms with a button to start a new one (name, kind, grades, streams), and a designer page per form. Everyone who may print report cards uses the form on **Reports > Report cards**: if the grade (and stream) has a form, "Print on: the school's form" is the default, with "Plain card (built-in)" as the other choice. If the form cannot be loaded, the plain card is used and a message says so.
- **The blank form:** a PDF (one or two pages) or a JPG/PNG scan. It is turned into JPEG page images **in the browser** (about 200 dpi, A4 width 1654 px, under 3 MB a page) and stored in the **private** bucket `report-forms`. Pages are opened through short-lived signed links. A PDF with more than two pages is refused. The PDF library is loaded only when a PDF is chosen.
- **Placing things (changed in the second Step 7A update, like the rectangle tool in Paint):** all positions are percentages of the page, so they do not depend on the scan size. After the blank form is loaded and the grade (and year, stream) is chosen, a list \"Place on the form\" shows **the subjects of that grade** and **the student information and totals** (name, ID, sex, date of birth, grade, section, stream, year, homeroom teacher, overall average, rank, pass/fail of the year, days absent, days late, print date). Nothing is placed automatically. Click a name, then **press, drag and release on the form: the rectangle drawn is the position and size** of that item (a dashed rectangle shows while dragging; dragging in any direction works; a plain click gives a normal size). After a subject is placed the next subject without a row is ready, so the table can be drawn line by line. **Draw the subjects table** is the quick way: one rectangle over the whole table and the subjects that have no row are divided evenly inside it, one row each. **Draw a column** (Semester 1 result %, Semester 2 result %, yearly average %, Pass/Fail) works the same way. A placed item is moved by dragging it or with the arrow keys (0.1% a step, Shift = 1%), **resized by dragging its corner** (width and height together) or by typing the width and height in the side panel; text size and alignment are set there too. A ✓ in the list marks what is placed (clicking it selects it); removing an item puts it back to \"not placed\". A whole-page printer adjustment in millimetres applies to every page. Only the rows' height and position and the columns' width and position matter when printing (a value is printed where a row crosses a column); the other sides of a drawn row or column are only a guide on screen.
- **Values** use the same numbers as Marks > Results and the plain card. A semester result is printed as a **percent of its maximum**. **A box stays blank** when the mark is missing, when the semester or year is not complete, or when the student does not take the subject; a zero is never printed for a missing mark. Overall average, rank and pass/fail print only for a complete student. A single field is printed inside the rectangle it was drawn with. Days absent and late are the whole-year counts of the student's section.
- **Checks in the designer:** a warning lists subjects of the chosen grade and year that have no row, rows for subjects the grade does not have, rows with no subject yet, subjects with two rows, and rows without columns. Warnings never block saving.
- **Preview and test print:** the stage can show the values of a real student of any section of the grade. "Print this page as a test" prints every page at full size with the printer adjustment: with a student chosen it prints his or her values, without one it prints sample values (88.8 and the field names), to be held against the blank form to the light.
- **Versions:** every save adds a new version through one database function (`save_report_template_version`), which checks the person's role and the shape of the layout. Versions can never be edited or deleted, and a form is switched off, not deleted. A print run uses the version that was current when the page was opened.
- **Printing:** the page asks for A4 with no browser margin while the school's form is on screen. Print at 100% (not "fit to page").
- **Assumptions to confirm:** (a) A4 portrait; (b) semester results as a percent of the semester maximum (as in the plan); (c) Pass/Fail uses the school's pass mark on the yearly average; (d) days absent and late cover the whole year.
- **Not built, different from the plan above:** the printed batch does **not** list the students affected by a subject without a row (only the designer warns); forms of kind Semester 1 or Semester 2 can be created and designed, but **only yearly forms are used for printing** (there is no semester card yet); the field "shift" and printed signature lines were left out (signatures are on the paper form); the row shows the subject name in the page language only, not both languages; conduct and remarks are still not stored (section 8, item 11); the designer is meant for a computer, not a phone.
- **Not tested:** nothing was tried in a real browser, on a real PDF or scan, with a real printer, or on Supabase itself. What was tested: the database rules (29 checks on PostgreSQL with the Supabase pieces replaced by stand-ins), the value rules (12 tests), and the screens in a browser simulation with a fake database (placing rows, a column and a field, moving by drag and keys, saving, printing two students on a two-page form).

### 4.9 Promotion and year rollover
- At year end, promote eligible students to the next grade as new enrollments, with the Director's approval. Repeaters stay in the same grade. Grade 12 completers are marked as graduated.

**As built in Step 7 (promotion) - decisions and assumptions**
- **Rule (decided by the school owner):** a student whose **overall yearly average is at or above the pass mark** (setting `pass_mark`, default 50%) moves up; any other student repeats. A Grade 12 student at or above the pass mark graduates. There is no rule about failing single subjects.
- **Suggestion, then approval:** the Promotion screen suggests a decision for every student; the director, vice director or system admin can change any decision and must approve. Nothing is saved before the approval. A student with incomplete marks gets no suggestion and must be decided by hand (or after the marks are finished).
- **One database function, all or nothing:** `apply_promotions` saves a whole group of decisions in one step; if any row breaks a rule, nothing is saved. Only the system admin, director and vice director may call it.
- **What it creates:** *moves up* = a new enrollment in the new year, next grade, status `promoted`, **no section yet**; *repeats* = a new enrollment, same grade and stream, status `repeater`, no section yet; *graduates* (Grade 12 only) = the enrollment and the student are marked `graduated`, no new enrollment. Earlier enrollments are never edited, except that a graduating Grade 12 enrollment gets the status `graduated`. Each decision is one row in `promotions` (who, when, which year) and is audited.
- **Stream:** Grade 9 to Grade 10 needs none; Grade 10 to Grade 11 needs the director to choose Natural or Social Science for every student (a bulk choice is offered); Grade 11 to Grade 12 and repeaters keep their stream.
- **Placing students:** the new enrollments have no section. The registrar places them on Students > Section allocation, as for any new year.
- **Rules in the database:** the new year must be later than the old year and open; only students of the old year who are not withdrawn or graduated; a student cannot get two enrollments in the new year; one decision per enrollment (a saved decision cannot be changed on the screen); Grade 12 cannot move up; only Grade 12 can graduate; withdrawal is not a promotion decision (it stays under Students).
- **Not in Step 7:** changing or undoing a saved decision (needs a database correction by the administrator for now), export to Excel or PDF, and a message to parents.

### 4.10 Security and safety
- Login required for everything in Phase 1
- Role-based access enforced by database rules
- Audit log of important actions
- Student data is never public, with one exception: a student's own results through the ID-and-PIN lookup (4.11). Core tables are never opened to anonymous visitors.
- Regular database backup instructions

### 4.11 Public website (planned, Step 10)

**Decided with the school owner:** the public website has **no sign-in and no sign-up**. Everything on it is either public school information or protected by a student ID plus a PIN. The pages are in English and Amharic with the same language switch and Ethiopian dates.

**Pages and features**
- **Home:** school name, short welcome, latest news, next events.
- **About:** history, mission, the director's message, location on a map.
- **Academics:** grades and streams, subject lists, and the school calendar with holidays and semester dates (read from the system, not typed twice).
- **Staff:** leadership and department heads only; teachers' names only if the school agrees; no private details.
- **News and events:** posted by the publishers (below), draft then publish.
- **Photo gallery:** photos of events. A photo with identifiable students needs the "consent recorded" box ticked by the publisher.
- **Downloads:** forms, calendars and notices as PDF files.
- **Announcements:** short notices such as exam weeks or "school closed", shown on top of the home page until their end date.
- **Admissions:** requirements, dates and fees, plus a **pre-registration form**.
- **Contact:** phone, address, map and a contact form with spam protection.
- **Results lookup:** student ID plus PIN (below).
- **Left out on purpose:** comments, forums, live chat and public accounts, because they need moderation and invite abuse.

**Results lookup (ID plus PIN)**
- A student's marks belong to the student's enrollment of each year, and the enrollment belongs to the student, so the permanent **student ID** (4.3) finds the marks of every year.
- **Second factor: a school-issued PIN**, 6 random digits made for each student, printed on the report card or handed out at registration. Date of birth is not used because classmates and relatives know it and there are few possible values.
- The PIN is stored only as a **hash**. It is shown once when issued. The registrar, director and vice director can issue a new PIN (the student ID never changes).
- The public site calls **one narrow database function** that checks the ID and PIN and returns only that student's name, grade, section and subject results. It returns no date of birth, guardian, address or photo.
- **Only published results** are returned. The director or vice director publishes a semester for a grade or section, and can only do so when every subject of that section is finalized (4.6). The yearly average appears only when both semesters are published. Publishing can be undone.
- **Guessing protection:** after 5 wrong attempts for one ID, lookups for it pause for 15 minutes; the error message never says whether the ID exists; the student ID's check character rejects typing mistakes before any lookup; every attempt is logged (time, success or not) in a table the administration can read. A per-visitor limit is also needed at the host (see hosting, section 8).
- Results use the same calculation engine as the Results screen, including the pass mark and rounding.

**Admissions pre-registration**
- The form creates a **pending application** (child's name, date of birth in the Ethiopian calendar, grade applied for, previous school, guardian name and phone). It does not create a student. The registrar reviews it and, if accepted, registers the student through the normal Step 4 form (with the details prefilled, to confirm).
- Applications and contact messages are private: the registrar, director and vice director read them (contact messages: director, vice director and publishers).
- Spam protection: a hidden trap field and a limit on submissions per visitor; a CAPTCHA only if spam appears.

**Publishing (who writes the public content)**
- The director, vice director and staff who hold the **Publisher permission** can create, edit, publish and remove news, events, announcements, gallery items and downloads. The **system admin cannot**. Each item has English and Amharic text (at least one language), a draft or published state, a publish date, and the author's name. Changes are in the audit log.
- Image upload rules: photos are resized in the browser before upload; a size limit applies; only images and PDFs are accepted.

**Security rules for the public site**
- The public site reads only from dedicated public tables, or from functions written for it. Anonymous visitors have **no access** to students, marks, enrollments, staff, guardians or any other core table.
- Public pages never show student names outside the PIN lookup (galleries use captions without names unless the school decides otherwise).

**Technical notes (to confirm at planning)**
- The public pages are a **separate, light entry** of the same project so visitors do not download the administration code.
- The current app uses hash addresses (`/#/en/...`), which search engines and link sharing handle poorly. Good web addresses for news pages need either path-based routing (the host must send every address to the app) or pre-built pages. This depends on the hosting decision (section 8, item 1).

**Data (planned):** `news_posts`, `events`, `announcements`, `gallery_items`, `downloads`, `admission_applications`, `contact_messages`, `student_pins` (hashes only), `results_publications` (semester, section, published by, published at), `lookup_attempts`, and a `can_publish` flag on `staff`. New numbered SQL files and a storage bucket for photos and downloads.

## 5. Main database tables

(Tables for assessment configuration were redesigned in Step 5, see 4.6; the subject catalogue per academic year is held as data in `subjects` and `grade_subjects`.)

`academic_years`, `semesters`, `profiles` (users and roles), `staff`, `departments`, `students`, `guardians`, `student_guardians`, `grades`, `streams`, `sections`, `subjects`, `grade_subjects`, `teacher_assignments`, `enrollments`, `assessment_structures`, `assessment_groups`, `assessment_components`, `marks`, `mark_locks`, `attendance`, `promotions`, `audit_log`.

Planned (not created yet): `news_posts`, `events`, `announcements`, `gallery_items`, `downloads`, `admission_applications`, `contact_messages`, `student_pins`, `results_publications`, `lookup_attempts` (4.11).

## 6. Build phases

| Step | What we build | Result | Status |
|---|---|---|---|
| 0 | GitHub repo, Supabase project, project skeleton, EN/AM switch, login | Empty app that logs in | Done |
| 1 | Database tables, roles and security rules | Secure database | Done |
| 2 | Academic years, school calendar (Mon-Fri, holidays), grades, **shifts**, sections, subjects | School structure ready | Done |
| 3 | Staff registration, teacher assignments, homeroom teachers | Staff ready | Done |
| 4 | Student registration and yearly enrollment (scope in 6.1) | Students ready | Done |
| 5 | Configurable assessment structures, marks entry and calculations (4.6) | Marks ready | Done |
| 6 | **Daily attendance**, 3-day edit window, absence number (default 5), attendance views | Attendance ready | Done |
| 7 | Reports, report cards, promotion | Year-end ready | Done |
| 8 | Testing with real staff, fixes | Test version | Done (by the school owner, Steps 0 to 7) |
| 7A | **Report card templates**: upload the school's own form and map values to it (4.8.1) | School's own card prints | Built; waits for a test on the real form |
| UI v2 | User-friendly interface and animation (section 11, parts A to F) | Easier and safer to use | Parts A to E done; F waits for the logo |
| 9 | **Timetable, per-period attendance, live alerts** | Period attendance ready | |
| 10 | **Public website** without sign-in or sign-up (4.11): news, events, announcements, gallery, downloads, admissions pre-registration, contact, results lookup with ID and PIN, publisher permission | Full site | Planned |
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
- Step 6 attendance: teachers write only the last 3 school days (today included); the administration can correct any day of an open year; excused needs a note; only absent counts toward the limit; the limit can be set per section; flagged students appear on screen (no messages until Step 9). Details in 4.7 "As built".
- UI v2 (section 11): the next work is a user-friendly interface and animation plan, delivered in parts A to F, each tested by the school owner. No database change. Step 9 (timetable and per-period attendance) follows it.
- Step 7: promotion rule is the overall yearly average at or above the pass mark; the director approves; export to Excel and PDF is skipped for now; report cards print from the browser. Details in 4.8 and 4.9 "As built".
- **Public website (decided):** no sign-in and no sign-up; no student or parent logins. Results are checked with the student ID plus a school-issued PIN (hash stored). Only results the director or vice director has published are visible. Details in 4.11.
- **Publishing (decided):** the director, vice director and staff with the Publisher permission publish public content; the system admin does not. The director or vice director grants the permission (to confirm).
- **Report card (decided):** the school's own printed form is uploaded as a background; the subject names stay as printed and the system fills only the numbers, by linking each printed row to a subject. Details in 4.8.1.
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
9. Step 6 assumptions to confirm: (a) the 3-day edit window counts today and the two school days before it; (b) an excused absence must have a note; (c) a unit leader can register attendance only for a section they also teach; (d) a locked semester does not block attendance; (e) the homeroom teacher, not the subject teachers, normally takes the daily roll call, but a subject teacher of the section is also allowed.

10. Step 7 assumptions to confirm: (a) the overall average is the plain mean of the subject yearly averages (every subject counts the same); (b) a student with a missing semester result in any subject is "incomplete" and is not suggested for promotion; (c) a Grade 12 student below the pass mark repeats Grade 12; (d) a saved promotion decision is final on the screen; (e) the card shows the homeroom teacher and director as blank signature lines, not names.

11. **Report card form (4.8.1):** the designer is built and works with any A4 form, but it has not been tried on yours. Please send the school's current report card as a clean PDF or scan (front and back). With it, please say: (a) which boxes it has besides the subject rows (total, average, rank, result, attendance, conduct, remarks, signatures, date); (b) whether Grades 9 to 12 use the same form, and whether the Semester 1, Semester 2 and yearly cards differ; (c) the paper size (A4 assumed); (d) **conduct and teacher remarks** are not stored in the system today: should they be added (a field per student per semester), or left blank for handwriting?
12. **Public website (4.11):** (a) who gets the Publisher permission, and may the director and vice director both grant it; (b) the contact details, address and map location; (c) the admissions requirements, dates and fees to show, and the pre-registration fields; (d) whether teachers' names may appear on the Staff page; (e) the policy for photos of students (consent) and whether gallery captions may name students; (f) how PINs are handed out (printed on the report card, a separate slip, or at registration); (g) who may issue a new PIN (registrar, director and vice director assumed); (h) a domain name for the site.
13. **Hosting limits the public site:** a per-visitor limit on PIN attempts and good web addresses for news pages depend on the hosting choice (item 1).

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
- **Daily roll call (Step 6, built):** everyone starts as present; a four-way button group per student (present, absent, late, excused, each with a word); a running count per status; students at or above the absence limit have a red edge and the words "At the limit"; on phones the four buttons sit in one row under the name.
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
- **Still to come, with the step that needs it:** highlight of a just-saved row, language cross-fade, dialogs and menus, the threshold pulse and animated counters on the roll call, marks grid feedback and counting totals, the left sidebar (the planned point after Step 6 has now been reached), stat tiles on the dashboard (as each step provides data).
- **Done in Step 4:** the six-step registration form with progress bar and review, student cards on phones (the student list becomes cards), the section allocation board (drag and the "Move to" menu, live counts), and a step slide-in. Not yet done: a timeline beside the enrollment (the enrollment history is a table), counting animations on the board.
- A future logo or official colors replace the palette by editing the tokens in 10.2; nothing else changes.
- **The remaining UI work listed here is now planned in section 11 (UI v2).**

### 10.9 Design review and polish update (lead-designer pass)

**Question asked:** would the lead designer publish the system looking the way it did after Step 5? **Verdict: not yet.** The foundation was sound (consistent tokens, no unstyled classes, good accessibility basics, calm motion), but several things read as unfinished next to the promises in 10.1 to 10.4. This update fixes the ones that can be fixed safely with styling alone, and lists the rest as still to do.

**Review method and its limit:** the repository was read in full (stylesheet, shell, login, dashboard, layouts, list pages), every CSS class used in the screens was checked to have a style (none missing), and the app was built and its tests run. The screens were **not** viewed in a browser in this review (no browser was available), so spacing is judged from the code and must be checked by eye on a real screen and phone before release.

**Problems found, and what was done**

| # | Problem | Fix (done in this update) |
|---|---|---|
| 1 | Working area limited to 56rem: tables, marks grids and the allocation board were squeezed on desktop | Content width raised to 72rem; padding reduced on phones |
| 2 | No identity: the top bar and login were plain text because there is no logo yet | Working monogram tile (gold square with the school's first letter, "H" in English and "ሀ" in Amharic) on the top bar and login panel. It is a placeholder, not branding (section 8, item 6) |
| 3 | Dashboard modules were one long list of identical rows | Responsive card grid; a teal top edge for ready modules, a gold edge for the rest; "Soon" modules shown quieter |
| 4 | Buttons and fields were about 38 to 42 px high, below the 44 px promised in 10.3 | Minimum height 44 px for buttons, inputs and selects (the compact move menu on allocation cards and the mark cells are kept smaller on purpose) |
| 5 | Tables looked flat; header barely separated from rows | Stronger header, light zebra rows, status row colors (error, warning) still take priority |
| 6 | Page titles had no visual weight | Consistent title size with a short gold underline |
| 7 | Panel headings sat directly on content | A thin rule under each panel heading |
| 8 | No footer, pages ended abruptly | Footer with school name and city; the page body now fills the screen height |

**Still to do (not in this update)**
- Dashboard stat tiles (students, staff, sections) and friendly empty states with one clear action (10.4); they need data queries.
- Left sidebar and breadcrumb (planned after Step 6).
- Real logo and official colors, when the school decides (section 8, item 6).
- A browser pass on a phone and an old school computer, in both languages, especially the six-step registration form, the allocation board and the marks grid.
- A "skip to content" link and a print stylesheet for report cards (Step 7).

**Files touched:** `src/styles.css` (new block at the end), `src/components/Shell.jsx` (footer), `docs/BLUEPRINT.md`, `docs/CHANGELOG.md`. No database change.
- **Done in Step 7:** printable report cards (one page each, screen controls hidden when printing), roster, subject sheets and the promotion table, styled with the existing tokens. Not yet done: a two-language card and a logo on the card (no logo yet, section 8, item 6).
- **Done in Step 6:** the daily roll call, summary and absence-limit screens (section 4.7 "As built"), styled with the existing tokens. Not yet done: the pulse when a student reaches the limit and animated counters.

## 11. UI v2 plan: user-friendly interface and animation

Added after Step 7. The school owner has tested Steps 0 to 7 and asked for a plan that makes the website **user friendly**. This section replaces the open UI items of section 10 and sets the order of the work. It is a working design direction like section 10: **no database change**, no new library (static files, CSS-only motion), and the palette of 10.2 stays until the school decides on a logo and official colors (section 8, item 6).

### 11.1 Goals
1. **Fewer clicks for daily jobs:** roll call, marks entry, registering a student and year-end promotion are reachable from the first screen.
2. **Always clear where you are and what happened:** navigation, breadcrumbs, and feedback after every save, error or deletion.
3. **No fear of mistakes:** dialogs say exactly what will change; risky actions ask first; saved work is visibly saved.
4. **Works on a phone and an old school computer**, in English and Amharic, with the same quality.
5. **Calm motion:** it explains what changed and never delays a task (rules in 10.6 still apply: CSS only, `transform` and `opacity` only, 150 to 250 ms, nothing loops, "reduce motion" respected).

### 11.2 Parts and order
Each part is delivered as its own update (zip with only added and edited files, working rule 1) and is tested by the school owner before the next part starts.

**Status:** Parts A and B are built (first UI v2 update, see "As built" under 11.4). Part C is built (second UI v2 update, see "As built" under 11.5). Part D is built (third UI v2 update, see "As built" under 11.6). Part E is built (fourth UI v2 update, see "As built" under 11.7). Part F is planned.

| Part | What | Result |
|---|---|---|
| A | Navigation and orientation | Easy to find things |
| B | "My work" dashboard per role | Daily jobs in one click |
| C | Feedback and safety | Clear, safe saving |
| D | Animation | Feels responsive |
| E | Phone and Amharic polish | Good on every device |
| F | Branding and print polish | School identity (when the logo is decided) |

### 11.3 Part A: navigation and orientation
- **Left sidebar on desktop** (the plan of 10.4, now due: there are seven modules). It collapses to a menu button on phones and tablets. The active module and sub-tab are marked; the sub-tabs stay at the top of the page.
- **Role-aware menu:** a person sees only the modules and tabs their role can use (for example a teacher does not see Staff or Promotion). This is only a screen convenience; the database rules stay the real protection.
- **Breadcrumb line** under the title (for example Students > Student profile), and a **"skip to content"** link for keyboard users.
- **Consistent page layout:** title, short one-line help text, toolbar (filters and the main action), content. The main action of a page is always in the same place and looks the same.
- **Keyboard:** every menu, tab and dialog works with the keyboard; the focus outline stays visible.

### 11.4 Part B: "my work" dashboard
The dashboard shows what the signed-in person does most, by role. The module cards stay below.
| Role | First-screen shortcuts |
|---|---|
| Teacher | My sections today; **Take today's roll call**; **Enter marks** for my subjects; my students at the absence limit |
| Unit leader | Marks waiting to be finalized; students at the absence limit; my teachers' subjects |
| Registrar | **Register a student**; students without a section; section allocation |
| Director, vice director | Students at the absence limit; marks to finalize; **year-end promotion**; section summary |
| System admin | All of the above, plus accounts without a role |
- **Stat tiles** (students, staff, sections, today's attendance) as small figures, each a link to its list.
- **Friendly empty states** on warm cream with one clear action ("No students yet. Register the first student"), as planned in 10.4.
- **Recent items:** the last pages a person opened, to reopen them in one click (as built: pages, not sections or subjects; see below).
- The shortcuts only read data that already exists; no new tables.

**As built in Parts A and B - decisions and assumptions**
- **Sidebar:** on screens 900 px wide or more it stays on the side with an icon and the name of each module and a gold marker on the active one. On smaller screens it is a drawer opened with a menu button in the top bar; it closes on a page change, with Escape and when the dark area is tapped. The old row of tabs at the top of the page is gone; the sub-tabs of each module stay at the top of its page. Icons are drawn inline, no library was added.
- **Role-aware menu:** every role sees Dashboard, School structure, Students, Marks, Attendance and Reports; **Staff** is shown to the system admin, director, vice director, unit leader and registrar only (the same roles the database lets read the staff list, so a teacher would see only an empty page). Nothing else is hidden because every role can read something in those modules; the database stays the real protection.
- **Breadcrumb** under the top bar on every page except the dashboard (Dashboard > Students > Register student). A student or staff profile shows "Details". The breadcrumb is not printed.
- **Skip link:** the first Tab on any page offers "Skip to content". All menu items, the menu button and the drawer work with the keyboard.
- **Dashboard** now has four blocks under the welcome banner: **At a glance** (tiles), **What would you like to do?** (role shortcuts), **Recently opened** and the **modules** list (only the modules the role can see).
  - Tiles: students enrolled this year (not withdrawn), sections, active staff, students marked absent today, and for the system admin accounts without a role. A teacher sees "My students" and "My sections" (sections where they teach or are homeroom teacher) and no staff tile. A figure that cannot be read is left out, not shown as 0. Each tile is a link.
  - Shortcuts by role: teacher (roll call, enter marks, absence limit, section roster); unit leader (finalize marks, absence limit, teacher assignments, enter marks); registrar (register a student, section allocation, import students); director and vice director (absence limit, finalize marks, year-end promotion, section roster); system admin (register a student, staff and accounts, promotion, academic years, absence limit). A shortcut is a link to an existing screen; it shows no count.
  - Empty states (cream panel, one action): no current academic year (the system admin, director and vice director get a button to Academic years; other roles are told to ask the administrator); no students yet (registrar and system admin get a button to register the first student); a teacher not assigned to any section (told to ask the director or vice director).
  - Recently opened keeps the last 4 pages (for example Marks > Results) in this browser only, per signed-in person. Only page addresses are stored, never names or ids; profile pages are not stored. Clearing the browser data clears the list.
- **Assumptions to confirm:** (a) the logo and official colors are still undecided, so the working palette is unchanged; (b) teachers are the main phone users, so the drawer, shortcuts and tiles were laid out for a phone first; (c) "absent today" counts attendance rows of today marked absent (the date is the computer's local date); (d) the shortcut list for each role is a first proposal and is easy to change.
- **Not in Parts A and B:** styled dialogs and saved-row highlights (Part C), most animation (Part D), table-to-card conversion (Part E). The only new motion is the existing fade-up for tiles and shortcuts, the sliding drawer and the gold marker on the active menu item, all switched off by "reduce motion".

### 11.5 Part C: feedback and safety
- **Styled dialogs** replace the browser's plain `confirm` window (used today when finalizing marks, changing a mark structure and approving promotion). A dialog names the action, how many records are affected and what cannot be undone, with a clear cancel button and a primary button worded as the action ("Approve and save 42 decisions"). Focus moves into the dialog and returns afterwards; Escape cancels.
- **Highlight of the row just saved or added** (gold fading to transparent), as already planned in 10.8.
- **Inline field errors** beside the field, in the chosen language, saying what is wrong and how to fix it; the form keeps what was typed.
- **Marks grid:** a small "Saved" mark in the cell or row after saving, and a visible warning when a save fails, so a teacher always knows whether a mark is stored.
- **Unsaved changes:** leaving a half-filled form (registration, structure editor) asks first.
- **Messages:** save, error and warning messages use one style and one place (top of the content); errors stay until dismissed.
- **Undo** is offered only where it is safe and simple (for example a mistaken roll-call change before saving). Nothing is undone silently in the database.

**As built in Part C - decisions and assumptions**
- **One dialog for every question.** All 13 places that used the browser's plain confirm window now use the same styled dialog (`useConfirm`): deleting a section, a calendar entry or a guardian; closing an academic year; finalizing and reopening marks (finalizing with missing marks is its own dialog); saving or deleting a mark structure (the dialog lists what will change, for example how many marks will be deleted); removing a staff login; changing a student's stream or status; creating more than 30 sections at once; approving year-end promotion.
- **Wording:** each dialog has a title that names the action, a line saying what changes and what cannot be undone, and a primary button worded as the action ("Delete entry", "Finalize marks", "Approve and save"). A dialog that deletes or cannot be undone is red-topped and starts with the focus on **Cancel**, so pressing Enter by mistake changes nothing. Escape, the Cancel button and a tap outside the box all cancel. Focus stays inside the dialog and returns to the button that opened it; the page behind does not scroll.
- **Unsaved changes:** the registration form and the mark structure editor ask before a menu or other link inside the app takes the person away, and the browser asks before closing or refreshing the tab. Switching language does **not** ask, because the form is kept. **Not covered:** the browser's Back button (the guard works for links, not for Back).
- **Saved-row highlight:** a row that was just added or changed glows gold for about two seconds on the lists of academic years, calendar entries, subjects, sections and departments. It is worked out by comparing the list before and after reloading, so nothing is saved or kept; the first load and a change of filter (for example another year) never flash. The highlight repaints only that one row, so it is the single exception to the "transform and opacity only" rule of 10.6.
- **Messages:** error messages now have a close button and stay until closed; "Saved." still fades away by itself. All messages remain in the same place (top of the content).
- **Inline errors (registration, step 1):** the missing names, sex and date of birth show a red message under their own field, linked to it for screen readers; after a failed Next, focus moves to the first problem. A message goes away as soon as that field is fixed. The summary list at the top stays. Other steps and forms still show their messages in the summary only (to be extended screen by screen).
- **Marks grid:** a cell that was just saved shows a short green ring; the line above the grid now says "Some marks were not saved. Fix the cells marked in red." while any cell has an error; failed cells already showed their own message.
- **Moved forward from Part D:** the fade and scale of the dialog itself (part of the dialog, so it ships with it).
- **Not included:** *Undo*. Part C of the plan allowed it only where safe and simple; no such place was found (roll call saves with an explicit Save button, and nothing is undone in the database silently).
- **Assumptions to confirm:** (a) a saved promotion decision still cannot be changed on screen, so its dialog says so; (b) the Amharic dialog wording is new and needs a native speaker; (c) the old plain texts (for example `common.confirmDelete`) are no longer used by these screens but are left in the language files.

### 11.6 Part D: animation
Same rules as 10.6. New and remaining motion, each with its purpose:
| Where | Animation | Purpose |
|---|---|---|
| Dialogs and menus | Fade and scale from 96 to 100 percent | Soft change of focus |
| Language switch | Quick cross-fade of the text (the page stays in place, so a half-filled form is never reset) | No flash of mixed text |
| Roll call | Smooth color change between present, absent, late and excused; the absence counter nudges when it changes; one gentle pulse when a student reaches the limit | Fast, clear roll call |
| Marks grid | A cell flashes terracotta above its maximum; totals count to the new value | Instant correction |
| Section allocation board | The card glides to its new column; counts animate; a column that becomes unbalanced pulses once | Moves are understandable |
| Registration form | The next step slides in from the reading direction; the progress bar fills | Clear progress |
| Saved row | Gold highlight fading out | Shows what changed |
| Loading | Skeletons shaped like the real table, card or form instead of generic bars | Calm waiting |
| Sidebar | Smooth open and close on phones; the active marker slides to the new item | Shows where you are |
- A single shared set of CSS motion tokens (duration, easing) is used everywhere, so the whole system moves the same way.
- Nothing moves while a person is typing, and nothing delays a task. Everything is switched off by "reduce motion".

**As built in Part D - decisions and assumptions**
- **Already shipped earlier, unchanged:** the fade and scale of dialogs (Part C), the gold highlight of a saved row (Part C), the step slide-in and progress bar of the registration form (Step 4), and the drawer and gold marker of the sidebar (Part A).
- **Shared motion:** one duration set (`--t-fast` 150 ms, `--t-base` 220 ms, new `--t-slow` 420 ms) and one easing, used by everything below. The small pure helpers (count steps, glide distances, "newly at the limit", "unbalanced") are in `src/lib/motion.js` and are covered by tests. The existing rule that switches off every animation and transition for "reduce motion" also covers all new CSS; the two pieces of script (counting and gliding) check the same setting and then jump straight to the final state.
- **Language switch:** the page text cross-fades for about 0.2 s (opacity only). The page is not remounted, so a half-filled form is never reset.
- **Roll call:** the status buttons change color smoothly; each status count (present, absent, late, excused) gives a small nudge when its number changes, never when the sheet first opens; a student who **has just reached the absence limit** after a save gets one gentle ring pulse. Students already at the limit when the sheet opens do not pulse.
- **Marks grid:** a cell above its maximum flashes terracotta once (a ring painted around the cell, so a second paint-only exception beside the saved-row highlight); the group totals, the result and the class average count to their new value. Totals change when a mark is saved (when the cell is left), not on every keystroke, so nothing moves while a teacher types.
- **Section allocation board:** a student card glides from its old place to the new column (transform only); the number of students in each column counts to the new number; a column that **becomes** unbalanced (more than 25% and at least 2 students from the average of the sections) pulses once. The pulse is only a hint and never blocks anything. Nothing pulses when the board first loads or after Propose.
- **Loading:** the placeholder can now have the outline of what is coming: `table` (header and rows), `cards` or `form`. In use on the student list, the section roster, the roll call sheet, the marks grid and the allocation board. The `form` shape is built but no screen uses it yet. All other screens keep the three plain lines.
- **Screen readers:** a counting number is hidden from screen readers while it moves and its final value is read out instead, so no intermediate numbers are announced.
- **Not built in Part D:** a marker that slides from one sidebar item to the next (the marker still grows in on the active item), skeletons on every screen, and sound (never planned).
- **Assumptions to confirm:** (a) "unbalanced" at 25% and 2 students is a first proposal; (b) the pulse colors (terracotta at the absence limit, gold on a column) are easy to change; (c) the count-up takes 0.42 s and can be shortened.

### 11.7 Part E: phone and Amharic polish
- **Tables become cards on phones** on every list that is still a wide table (staff, assignments, results, attendance summary), as the student list already does.
- **Sticky action bar** (Save, Next) on long forms and the marks grid on phones, so the main button is never scrolled away.
- **Touch targets** of at least 44 px everywhere, including the compact controls kept smaller on purpose (the allocation "Move to" menu and mark cells get a larger tap area without growing the layout).
- **Amharic:** longer labels must wrap without breaking layouts; line height stays looser; every new text exists in both languages before release.
- **Old computers:** no heavy effects; pages must stay smooth on slow hardware. A test pass on an old school computer and a low-cost phone is part of this part's acceptance.
- **Accessibility checks** from 10.7 are repeated on every changed screen (contrast, focus, labels, color never the only signal).

**As built in Part E - decisions and assumptions**
- **Assumption (11.10, item 3):** teachers are the main phone users (roll call and marks), so those screens were laid out first. Tell me if registrars or directors use phones more.
- **Tables become cards on phones (screen width 720 px or less):** the staff list, both tables on Teacher assignments (subjects of a section, teacher workload) and both tables of Marks > Results (all subjects, one subject) now use the same card layout as the student list and the attendance summary. On a card the person's or subject's name is the title and every other value has its column name in front of it. Class average rows stay as a cream card. A test checks that every cell of such a table has a label, so a new column cannot end up as a bare number.
- **Left as scrolling tables on purpose:** the section roster and subject sheets (one column per subject; as cards they would be very long and are mostly printed), the school structure lists, the mark structure editor and the marks entry grid (a grid has to stay a grid to be filled in quickly).
- **Sticky action bar (screen width 640 px or less):** the main buttons stay at the bottom of the screen while scrolling: Back and Next / Save on the registration form, Save on the staff form, Save and Delete in the mark structure editor, and the entered-marks line with Finalize and Reload on the marks grid. They sit above the phone's home bar (safe area). The roll call and section allocation already had their own bar.
- **Touch targets:** on phones and touch screens the controls that were kept small on desktop reach 44 px: the "Move to" menu on allocation cards, the mark cells (now at least 4.25 rem wide), links inside tables, breadcrumb and recent-page links, the close button of messages and checkboxes. This makes allocation cards and mark rows a little taller on a phone; the desktop layout does not change.
- **Amharic and long labels:** buttons, status buttons, tabs, pills, menu items and tiles wrap long words instead of overflowing; Amharic gets a looser line height on buttons and in tables, and slightly smaller text in the four status buttons on a phone. No new texts were added, so no language file changed.
- **Not done / to check:** the pages were not viewed on a real phone or in a real browser, in either language, and no old-computer test was made (11.7 asks for it). Please test the roll call, marks grid, registration form and allocation board in Amharic on a phone first. The accessibility checks of 10.7 were applied in the code (labels, focus, no color-only signals) but not measured with a tool.

### 11.8 Part F: branding and print polish (when the school decides)
- When the school gives a **logo and official colors**, only the design tokens (10.2) and the monogram placeholder change; no screen is redesigned.
- **Report card:** logo in the header, a name line for the director and homeroom teacher, and optionally a **two-language card** (English and Amharic side by side). Until then the card keeps the plain header of Step 7.
- A **print stylesheet** pass for the roster and sheets (repeat the table header on every page, avoid splitting a row).

### 11.9 Acceptance for every part
1. The app builds and `npm test` passes; no new test is removed.
2. The changed screens are checked in English and Amharic, on a desktop and on a phone.
3. Contrast, keyboard use and "reduce motion" are checked (10.7).
4. The school owner tests the part with real staff roles before the next part starts, and problems are fixed in the next update.
5. The blueprint and changelog are updated in the same zip (working rules 2 and 6).

### 11.10 Still needed from you
1. ~~Start with Parts A and B together?~~ **Answered: yes. Built.**
2. Logo and official colors: still **undecided** (section 8, item 6). Until then the working palette is used.
3. Which roles use the system most on **phones** (teachers for roll call and marks is assumed), so Part E tests those screens first.
4. Is a **two-language report card** wanted, or is a card in the language of the page enough?
