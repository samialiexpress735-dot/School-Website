// Screen convenience only. The database rules (002 and 004) are the real protection.
export const STRUCTURE_EDITORS = ["system_admin", "director", "vice_director"];
export const SECTION_EDITORS = [...STRUCTURE_EDITORS, "registrar"];

export const can = (profile, roles) => Boolean(profile?.is_active && roles.includes(profile.role));

export const STAFF_EDITORS = ["system_admin", "director", "vice_director"];
export const ASSIGNERS = ["system_admin", "director", "vice_director"];
export const ALL_ROLES = ["system_admin", "director", "vice_director", "unit_leader", "registrar", "teacher"];

// Step 4: who registers, imports and allocates students, and who may change a stream.
export const REGISTRARS = ["system_admin", "registrar"];
export const STREAM_CHANGERS = ["system_admin", "registrar", "director", "vice_director"];
