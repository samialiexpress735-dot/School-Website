// UI v2, Part B: what the dashboard offers each role. Pure functions, so they are easy to test.
// Shortcuts and tiles only link to screens that already exist; the database still decides what can be read.

const SHORTCUTS = {
  rollCall: { to: "attendance", icon: "attendance" },
  enterMarks: { to: "marks", icon: "marks" },
  absenceLimit: { to: "attendance/flags", icon: "flag" },
  finalizeMarks: { to: "marks/results", icon: "marks" },
  assignments: { to: "staff/assignments", icon: "staff" },
  registerStudent: { to: "students/new", icon: "students" },
  allocation: { to: "students/allocation", icon: "structure" },
  importStudents: { to: "students/import", icon: "students" },
  promotion: { to: "reports/promotion", icon: "reports" },
  roster: { to: "reports", icon: "reports" },
  staffAccounts: { to: "staff", icon: "staff" },
  years: { to: "structure/years", icon: "structure" },
};

const BY_ROLE = {
  teacher: ["rollCall", "enterMarks", "absenceLimit", "roster"],
  unit_leader: ["finalizeMarks", "absenceLimit", "assignments", "enterMarks"],
  registrar: ["registerStudent", "allocation", "importStudents"],
  director: ["absenceLimit", "finalizeMarks", "promotion", "roster"],
  vice_director: ["absenceLimit", "finalizeMarks", "promotion", "roster"],
  system_admin: ["registerStudent", "staffAccounts", "promotion", "years", "absenceLimit"],
};

export const shortcutsFor = (role) => (BY_ROLE[role] || []).map((key) => ({ key, ...SHORTCUTS[key] }));

// The small figures at the top. A figure that could not be loaded (null) is simply left out.
// A teacher sees their own numbers (the database only lets them read their own sections anyway).
export function tilesFor(role, s = {}) {
  const teacher = role === "teacher";
  const tiles = [
    { key: teacher ? "myStudents" : "students", value: s.students, to: "students" },
    teacher
      ? { key: "mySections", value: s.mySections, to: "attendance" }
      : { key: "sections", value: s.sections, to: "structure/sections" },
    teacher ? null : { key: "staff", value: s.staff, to: "staff" }, // teachers cannot open the staff list
    { key: "absentToday", value: s.absentToday, to: "attendance/summary" },
    role === "system_admin" ? { key: "noRole", value: s.noRole, to: "staff" } : null,
  ];
  return tiles.filter((x) => x && Number.isFinite(x.value));
}

// Which empty state, if any, replaces the figures. Returns "noYear", "noStudents", "noSections" or null.
export function emptyStateFor(role, s) {
  if (!s) return null;
  if (!s.year) return "noYear";
  if ((role === "registrar" || role === "system_admin") && s.students === 0) return "noStudents";
  if (role === "teacher" && s.mySections === 0) return "noSections";
  return null;
}
