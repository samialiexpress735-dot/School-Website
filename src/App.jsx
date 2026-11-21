import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Protected from "./components/Protected.jsx";
import StructureLayout from "./pages/structure/StructureLayout.jsx";
import YearsPage from "./pages/structure/YearsPage.jsx";
import CalendarPage from "./pages/structure/CalendarPage.jsx";
import SubjectsPage from "./pages/structure/SubjectsPage.jsx";
import SectionsPage from "./pages/structure/SectionsPage.jsx";
import StaffLayout from "./pages/staff/StaffLayout.jsx";
import StaffListPage from "./pages/staff/StaffListPage.jsx";
import StaffFormPage from "./pages/staff/StaffFormPage.jsx";
import AssignmentsPage from "./pages/staff/AssignmentsPage.jsx";
import DepartmentsPage from "./pages/staff/DepartmentsPage.jsx";
import { LangProvider, LANGS, DEFAULT_LANG } from "./i18n/index.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

function LangRoutes() {
  const { lang } = useParams();
  if (!LANGS.includes(lang)) return <Navigate to={`/${DEFAULT_LANG}/dashboard`} replace />;
  return (
    <LangProvider lang={lang}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="dashboard" element={<Protected><DashboardPage /></Protected>} />
        <Route path="structure" element={<Protected><StructureLayout /></Protected>}>
          <Route index element={<Navigate to="years" replace />} />
          <Route path="years" element={<YearsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="sections" element={<SectionsPage />} />
        </Route>
        <Route path="staff" element={<Protected><StaffLayout /></Protected>}>
          <Route index element={<StaffListPage />} />
          <Route path="new" element={<StaffFormPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="departments" element={<DepartmentsPage />} />
          <Route path=":id" element={<StaffFormPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </LangProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${DEFAULT_LANG}/dashboard`} replace />} />
      <Route path="/:lang/*" element={<LangRoutes />} />
    </Routes>
  );
}
