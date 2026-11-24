// UI v2, Part A: which modules each role sees in the menu, and how the breadcrumb line is worked out.
// This only decides what the SCREEN offers. The database rules (002 and later) stay the real protection.
import { ALL_ROLES } from "./roles.js";

// A role sees a module when it can read something in it. The staff list is readable by the office roles only
// (policy "staff read office"), so teachers do not get the Staff item; a teacher sees their own sections' data elsewhere.
export const NAV_MODULES = [
  { key: "dashboard", roles: ALL_ROLES },
  { key: "structure", roles: ALL_ROLES },
  { key: "staff", roles: ["system_admin", "director", "vice_director", "unit_leader", "registrar"] },
  { key: "students", roles: ALL_ROLES },
  { key: "marks", roles: ALL_ROLES },
  { key: "attendance", roles: ALL_ROLES },
  { key: "reports", roles: ALL_ROLES },
];

export const visibleModules = (role) => NAV_MODULES.filter((m) => m.roles.includes(role));

// The tab shown when the address has no second part, and the tabs the second part can name.
const INDEX_TAB = { students: "list", staff: "list", marks: "entry", attendance: "roll", reports: "roster" };
const KNOWN_TABS = {
  structure: ["years", "calendar", "subjects", "sections"],
  staff: ["assignments", "departments"],
  students: ["import", "allocation"],
  marks: ["results", "structures"],
  attendance: ["summary", "flags"],
  reports: ["cards", "sheets", "promotion", "templates"],
};

// "/en/students/new" -> { module: "students", tab: "register" }. Returns null on the dashboard and unknown pages.
// An address part that is none of the known tabs (a student or staff id) becomes tab "details".
export function breadcrumbParts(pathname) {
  const segs = String(pathname).split("/").filter(Boolean).slice(1); // drop the language
  const module = segs[0];
  if (!module || module === "dashboard" || !NAV_MODULES.some((m) => m.key === module)) return null;
  const rest = segs[1];
  if (!rest) return { module, tab: INDEX_TAB[module] || null };
  if (rest === "new") return { module, tab: module === "students" ? "register" : "new" };
  if ((KNOWN_TABS[module] || []).includes(rest)) return { module, tab: rest };
  return { module, tab: "details" };
}

// Translation keys for the crumbs, for example { module: "nav.students", tab: "students.tabs.register" }.
export function crumbKeys({ module, tab }) {
  const tabKey = !tab ? null : tab === "details" || tab === "new" ? `nav.${tab}` : `${module}.tabs.${tab}`;
  return { module: `nav.${module}`, tab: tabKey };
}
