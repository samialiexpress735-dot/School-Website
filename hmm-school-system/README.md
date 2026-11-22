# Haile Mariam Mamo Secondary School – Administration System

ሀይለ ማርያም ማሞ ሁለተኛ ደረጃ ትምህርት ቤት · ደብረብርሃን (Debre Birhan)

Bilingual (English default, Amharic) school administration system.
The full plan is in **`docs/BLUEPRINT.md`**.

## What is in this version (Steps 0 to 4)

| Step | Status | What |
|---|---|---|
| 0 | Done | App skeleton, English/Amharic switch (`#/en/...`, `#/am/...`), login, dashboard |
| 1 | Done | Database tables, roles and security rules, starting data |
| 2 | Done | Academic years and semesters, school calendar (Mon-Fri, holidays), subjects and subjects per grade, sections with morning/afternoon shifts |
| 3 | Done | Staff (teaching and non-teaching), login account linking, departments, teacher assignments, homeroom teachers, workload |
| 4 | Done | Student registration (six steps), student ID, yearly enrollment, section allocation board, import of existing students |
| 5 | Next | Configurable marks |

Staff and student screens come in later steps.

## Folder guide

- `src/` – the web app (`i18n/en.js` and `i18n/am.js` hold all English and Amharic text)
- `supabase/migrations/` – database files, run in order: `001` to `011`
- `docs/BLUEPRINT.md` – the blueprint

## Setup, step by step

### 1. Put the project on GitHub
1. On github.com create a new **private** repository (for example `hmm-school-system`). Do not add a README.
2. Unzip this project. In the repository choose **Add file > Upload files**, drag in everything **inside** the unzipped folder, and commit.
3. Never upload a file called `.env` (it holds secret settings). `.gitignore` already blocks it.

### 2. Create the Supabase test database
1. Create a free project at supabase.com. Save the database password.
2. Open **SQL Editor**. Paste and run these files **in this order**, one at a time:
   `supabase/migrations/001_core_schema.sql`, then `002_security_policies.sql`, then `003_seed_data.sql`, then `004_step2_structure.sql`, then `005_step3_staff.sql`, then `006_blueprint_sync.sql`, then `007_step4_students.sql`, then `008_step5_marks.sql`, then `009_step5_teacher_structures.sql`, then `010_step6_attendance.sql`, then `011_step6_fix_semester_dates.sql`.
3. Open **Authentication > Sign In / Providers** and turn **off** "Allow new users to sign up" (only the administrator creates accounts).
4. Open **Authentication > Users > Add user > Create new user**. Enter your email and a strong password, and tick auto-confirm.
5. Make yourself the first administrator. In **SQL Editor** run (use your email):

```sql
update public.profiles
set role = 'system_admin', full_name = 'Your Name'
where id = (select id from auth.users where email = 'you@example.com');
```

### 3. Connect the app to Supabase
1. In Supabase open **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
2. Copy `.env.example` to `.env` and paste the two values in. Do **not** use the `service_role` key anywhere in this app.

### 4. Run it on a computer
Install Node.js (version 18 or newer), then in the project folder:

```
npm install
npm run dev
```

Open the address it prints. Sign in with the account from step 2.

To make the files for a website host, run `npm run build`; the `dist` folder is the website.

To run the calculation tests, run `npm test`.

## Updating
Update zips contain only added and edited files (see `docs/CHANGELOG.md`). Expand them into the project folder, then run only the new SQL file named in the changelog.

## Registering and importing students
- **Students > Register student** is a six-step form. The date of birth is typed in the Ethiopian calendar. The student ID (for example `HMM-2019-7QK4M-X`) is created automatically after saving.
- **Students > Import students**: download the template, fill it in (one row per student, dates of birth as Ethiopian `dd/mm/yyyy`, format that column as text in Excel), upload the CSV or .xlsx file, check the preview, then import. Download the results file to keep the new student IDs.
- **Students > Section allocation**: propose, review, move students, approve.

## Marks structures
- The system admin, director and vice director set up the mark structure of every subject (**Marks > Structures**) and the school settings.
- A **teacher** can set up and edit the structure of the subjects they are assigned to. Teachers of the same subject and grade share one structure. When an assessment already has marks, the system asks for confirmation before deleting marks or recalculating results. A finalized section, a locked semester or a closed year cannot be changed by a teacher.

## Giving staff a login
1. In Supabase open **Authentication > Users > Add user**, enter the person's email and a password, and tick auto-confirm.
2. In the app sign in as the system administrator, open **Staff**, open the person's record, and in **Login account** choose their email, pick a role and click **Link account**.

## How security works
- No role means no access. A new account can sign in but sees nothing until the system administrator gives it a role.
- Only the system administrator, director and vice director assign teachers. Unit leaders cannot.
- Only the system administrator, director and vice director change the mark structure of any subject; a teacher changes it only for subjects they are assigned to.
- Teachers see and edit marks and attendance only for sections and subjects assigned to them.
- Students are registered once. Each year they get an **enrollment** (year, grade, section, stream), so history is kept.
- Every important change is recorded in `audit_log`.
- Row Level Security was tested on a local PostgreSQL: wrong-section marks, scores above maximum, duplicate enrollments and role self-promotion are all refused.

## Notes
- The site uses `#` addresses (for example `/#/am/dashboard`) so it works on any hosting, including basic Ethio Telecom hosting.
- Subjects are kept per academic year. Update `006` reconciles the draft list from `003_seed_data.sql` with the blueprint; still confirm the subjects and periods for each grade and stream (HPE and Agriculture in Grades 11 and 12 are not loaded until you confirm them).
- Fonts are bundled (no Google Fonts needed).

## Taking attendance
- **Attendance > Daily roll call:** choose the section and the date. Everyone starts as present; change only the exceptions and press **Save attendance**. Teachers can change the last 3 school days of their own sections; the administration can correct any school day of an open year.
- The **absence limit** (5 per semester by default) can be changed per section by the homeroom teacher or the administration, inside the roll call screen. **Summary** shows semester totals, and **Absence limit** lists the students who have reached it.
