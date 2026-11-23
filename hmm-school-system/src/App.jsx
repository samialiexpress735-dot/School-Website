import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Protected from "./components/Protected.jsx";
import StructureLayout from "./pages/structure/StructureLayout.jsx";
import YearsPage from "./pages/structure/YearsPage.jsx";
import CalendarPage from "./pages/structure/CalendarPage.jsx";
import SubjectsPage from "./pages/structure/SubjectsPage.jsx";
import SectionsPage from "./pages/structure/SectionsPage.jsx";
import StudentsLayout from "./pages/students/StudentsLayout.jsx";
import StudentListPage from "./pages/students/StudentListPage.jsx";
import RegisterPage from "./pages/students/RegisterPage.jsx";
import StudentProfilePage from "./pages/students/StudentProfilePage.jsx";
import ImportPage from "./pages/students/ImportPage.jsx";
import AllocationPage from "./pages/students/AllocationPage.jsx";
import MarksLayout from "./pages/marks/MarksLayout.jsx";
import EntryPage from "./pages/marks/EntryPage.jsx";
import ResultsPage from "./pages/marks/ResultsPage.jsx";
import StructuresPage from "./pages/marks/StructuresPage.jsx";
import AttendanceLayout from "./pages/attendance/AttendanceLayout.jsx";
import RollCallPage from "./pages/attendance/RollCallPage.jsx";
import SummaryPage from "./pages/attendance/SummaryPage.jsx";
import FlagsPage from "./pages/attendance/FlagsPage.jsx";
import ReportsLayout from "./pages/reports/ReportsLayout.jsx";
import RosterPage from "./pages/reports/RosterPage.jsx";
import ReportCardPage from "./pages/reports/ReportCardPage.jsx";
import SheetsPage from "./pages/reports/SheetsPage.jsx";
import PromotionPage from "./pages/reports/PromotionPage.jsx";
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
        <Route path="students" element={<Protected><StudentsLayout /></Protected>}>
          <Route index element={<StudentListPage />} />
          <Route path="new" element={<RegisterPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="allocation" element={<AllocationPage />} />
          <Route path=":id" element={<StudentProfilePage />} />
        </Route>
        <Route path="marks" element={<Protected><MarksLayout /></Protected>}>
          <Route index element={<EntryPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="structures" element={<StructuresPage />} />
        </Route>
        <Route path="attendance" element={<Protected><AttendanceLayout /></Protected>}>
          <Route index element={<RollCallPage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="flags" element={<FlagsPage />} />
        </Route>
        <Route path="reports" element={<Protected><ReportsLayout /></Protected>}>
          <Route index element={<RosterPage />} />
          <Route path="cards" element={<ReportCardPage />} />
          <Route path="sheets" element={<SheetsPage />} />
          <Route path="promotion" element={<PromotionPage />} />
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
