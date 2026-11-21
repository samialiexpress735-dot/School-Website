# Haile Mariam Mamo Secondary School – System Blueprint

ሀይለ ማርያም ማሞ ሁለተኛ ደረጃ ትምህርት ቤት · ደብረብርሃን (Debre Birhan)

Version 1 · Phase 1: School Administration System

**Progress:** Steps 0 (skeleton, login, languages), 1 (database and security) and 2 (school structure) are done. Step 3 is next.
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

Final hosting depends on what Ethio Telecom provides. If it only offers static hosting, the front end goes there and Supabase stays as the database. If it offers a VPS, we can move the database there later. Database structure lives in SQL files, so moving is clean.

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
- Full name (English and Amharic), sex, date of birth, phone, email, address, photo
- Employee ID, role, department, qualification, field of study, hire date, employment status
- Login account linked to the staff record

### 4.3 Student registration
Every required field is validated before saving.

**Student:** full name in English and Amharic (first, father, grandfather), sex, date of birth (E.C. and G.C.), place of birth, nationality, religion (optional), photo, student ID (auto-generated), date of admission.

**Address and contact:** region, zone, woreda, kebele, house number, phone.

**Parent or guardian (at least one required):** full name, relationship, phone, occupation, address; plus mother's name and an emergency contact.

**Previous education:** previous school, last grade completed, transfer certificate number (if transfer), Grade 8 national exam result (for Grade 9 entrants).

**Other:** health condition or disability (optional), documents list (birth certificate, transfer letter, photo).

### 4.4 Yearly enrollment (how years are stored)
A student is registered once, then **enrolled each year** in a separate record containing: academic year, grade, section, stream (Grades 11 and 12), status (new, promoted, repeater, transfer in, withdrawn, graduated). Marks and attendance link to the enrollment, so a student's full history across years is always preserved and nothing is overwritten.

### 4.5 Grades, sections and subjects
- Grades 9 to 12, each with sections (A, B, C and so on) and a capacity
- Subject list per grade and stream, entered as data so it is easy to update
- Section allocation: manual, or automatic balanced split by sex and previous results, which the Registrar can adjust
- **Two shifts:** every section belongs to a shift, **morning** or **afternoon**. The school is mainly single shift today, but the system supports both from the start, so section "A" can exist in each shift. Each shift has its own roll call. (Built in Step 2.)
- Teacher assignment: teacher + subject + section + year. One teacher per subject per section; a teacher may be assigned in both shifts.
- Who assigns: **system admin, director and vice director only.** Unit leaders and registrars cannot assign teachers.
- Each section has one **homeroom teacher**, who can see all marks and attendance of that section but enters marks only for the subjects they teach.
- A teacher sees only their assigned sections. If the teacher of a subject changes mid-year, access moves to the new teacher; marks already entered stay, with the name of who entered them.
- Planned screens (Step 3): assignment table per section, teacher workload, "copy last year's assignments".

### 4.6 Marks
- Assessment types per subject (for example quiz, test, assignment, mid-exam, final), with configurable maximum marks and weights summing to 100
- Teachers enter marks per assessment; the system calculates semester total and yearly average
- Marks can be locked by the Director or Unit Leader once finalized
- Every change is recorded (who, when, old value, new value)

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
- The school default is **5 absences**. It is a number, not a percentage.
- Counting rule (assumed, to be confirmed): absences are counted per **semester**; **excused** and **late** do not count as absences.
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

`academic_years`, `semesters`, `profiles` (users and roles), `staff`, `departments`, `students`, `guardians`, `student_guardians`, `grades`, `streams`, `sections`, `subjects`, `grade_subjects`, `teacher_assignments`, `enrollments`, `assessment_types`, `marks`, `attendance`, `promotions`, `audit_log`.

## 6. Build phases

| Step | What we build | Result | Status |
|---|---|---|---|
| 0 | GitHub repo, Supabase project, project skeleton, EN/AM switch, login | Empty app that logs in | Done |
| 1 | Database tables, roles and security rules | Secure database | Done |
| 2 | Academic years, school calendar (Mon-Fri, holidays), grades, **shifts**, sections, subjects | School structure ready | Done |
| 3 | Staff registration, teacher assignments, homeroom teachers | Staff ready | Next |
| 4 | Student registration and yearly enrollment | Students ready | |
| 5 | Marks entry and calculations | Marks ready | |
| 6 | **Daily attendance**, 3-day edit window, absence number (default 5), attendance views | Attendance ready | |
| 7 | Reports, report cards, promotion | Year-end ready | |
| 8 | Testing with real staff, fixes | Test version | |
| 9 | **Timetable, per-period attendance, live alerts** | Period attendance ready | |
| 10 | Public website (news, events, gallery, admissions, results lookup, parent and student logins) | Full site | |
| 11 | Move to official Ethio Telecom deployment | Live | |

Each step is delivered as files you commit to GitHub, then tested before the next step. Database changes for a step arrive as a new numbered SQL file (for example `004_...`), run after the earlier ones.

## 7. Decisions made

- Attendance: daily first, per-period with live alerts later (Step 9).
- Two shifts supported (morning, afternoon), default mainly single shift.
- School days Monday to Friday.
- Teachers may edit attendance for the last 3 school days only.
- Absence threshold is a number, default 5, changeable by the homeroom teacher for their section.
- **Unit leaders cannot assign teachers.** Only the system admin, director and vice director can.

## 8. Still needed from you

1. What kind of Ethio Telecom hosting will be used (static, PHP, Node.js, VPS)?
2. Subject list per grade (including the Grade 11 and 12 streams). A draft is in `supabase/migrations/003_seed_data.sql`; you or a teacher must confirm it against the national curriculum.
3. Mark breakdown used by the school (for example 10 quiz, 20 test, 20 assignment, 50 final) and the pass mark.
4. Number of sections per grade and expected students per section.
5. Student ID format the school uses, if any.
6. School logo and colors (current colors are a proposal: deep blue and gold).
7. Who will be the first System Admin?
8. Absence number: is it counted per semester (assumed), per month, or in a row? Do excused absences count?
