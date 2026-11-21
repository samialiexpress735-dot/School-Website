// Screen convenience only. The database rules (002 and 004) are the real protection.
export const STRUCTURE_EDITORS = ["system_admin", "director", "vice_director"];
export const SECTION_EDITORS = [...STRUCTURE_EDITORS, "registrar"];

export const can = (profile, roles) => Boolean(profile?.is_active && roles.includes(profile.role));
