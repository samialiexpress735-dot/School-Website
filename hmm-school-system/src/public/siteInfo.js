// Facts about the school that only the school can give. Fill these in; anything left as null is simply not shown,
// so the public site never shows a made-up phone number, address or fee.
export const SITE_INFO = {
  phone: null,          // e.g. "+251 11 000 0000"
  email: null,          // e.g. "info@yourschool.com.et"
  address: { en: null, am: null }, // e.g. { en: "Kebele 03, Debre Birhan", am: "..." }
  mapUrl: null,         // link to the school on a map
  officeHours: { en: null, am: null },
  admissions: {
    // Each is { en, am } text or null. Shown on the Admissions page.
    requirements: { en: null, am: null },
    dates: { en: null, am: null },
    fees: { en: null, am: null },
  },
  about: {
    history: { en: null, am: null },
    mission: { en: null, am: null },
    directorMessage: { en: null, am: null },
  },
};

export const pick = (field, lang) => (field ? field[lang] || field.en || null : null);
