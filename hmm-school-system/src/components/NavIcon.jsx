// Small outline icons drawn inline (no icon library, so nothing extra to download).
// They are decoration only: the text beside them says what the item is.
const PATHS = {
  dashboard: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  structure: <><path d="M4 20V8l8-4 8 4v12" /><path d="M9 20v-6h6v6" /><path d="M4 20h16" /></>,
  staff: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.3.2 3.7 1.7 4.1 4.3" /></>,
  students: <><path d="M2.5 9 12 4.5 21.5 9 12 13.5z" /><path d="M6.5 11.3v4.4c0 1.2 2.5 2.8 5.5 2.8s5.5-1.6 5.5-2.8v-4.4" /><path d="M21.5 9v5" /></>,
  marks: <><path d="M5 4.5h11l3 3V19.5H5z" /><path d="M8.5 11h7M8.5 14h7M8.5 17h4" /></>,
  attendance: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3.5v3M15.5 3.5v3" /><path d="m9 14.5 2 2 4-4" /></>,
  reports: <><path d="M4.5 19.5h15" /><path d="M7 19.5v-6M12 19.5V6.5M17 19.5v-9" /></>,
  flag: <><path d="M6 20.5V4" /><path d="M6 5h11l-2 4 2 4H6" /></>,
};

export default function NavIcon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name] || PATHS.dashboard}
    </svg>
  );
}
