// Screen convenience only. The database rules (002 and 004) are the real protection.
export const STRUCTURE_EDITORS = ["system_admin", "director", "vice_director"];
export const SECTION_EDITORS = [...STRUCTURE_EDITORS, "registrar"];

export const can = (profile, roles) => Boolean(profile?.is_active && roles.includes(profile.role));

export const STAFF_EDITORS = ["system_admin", "director", "vice_director"];
export const ASSIGNERS = ["system_admin", "director", "vice_director"];
export const ALL_ROLES = ["system_admin", "director", "vice_director", "unit_leader", "registrar", "teacher"];

// Step 5: who sets up the mark structures, who can enter marks, who finalizes and who reopens.
// Administrators edit every structure and use the copy tools and school settings.
// A teacher edits only the structures of subjects and grades they are assigned to (the database decides, see 009).
export const MARK_STRUCTURE_ADMINS = ["system_admin", "director", "vice_director"];
export const MARK_STRUCTURE_EDITORS = [...MARK_STRUCTURE_ADMINS, "teacher"];
export const MARK_ENTERERS = ["system_admin", "teacher", "unit_leader"]; // teachers and unit leaders only for subjects they teach
export const MARK_LOCKERS = ["system_admin", "director", "vice_director", "unit_leader"];
export const MARK_UNLOCKERS = ["system_admin", "director", "vice_director"];

// Step 4: who registers, imports and allocates students, and who may change a stream.
export const REGISTRARS = ["system_admin", "registrar"];
export const STREAM_CHANGERS = ["system_admin", "registrar", "director", "vice_director"];
