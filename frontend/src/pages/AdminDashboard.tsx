import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { PageTitle } from "../components/ui";
import { AuditPanel } from "../features/audit/AuditPanel";
import { ReportView } from "../features/reports/ReportView";
import { CatalogPanel } from "../features/admin/CatalogPanel";
import { CoursesPanel } from "../features/admin/CoursesPanel";
import { EnrollmentsPanel } from "../features/admin/EnrollmentsPanel";
import { HolidaysPanel } from "../features/admin/HolidaysPanel";
import { InicioPanel } from "../features/admin/InicioPanel";
import { LocationProposalsPanel } from "../features/admin/LocationProposalsPanel";
import { RoomsPanel } from "../features/admin/RoomsPanel";
import { SchedulesPanel } from "../features/admin/SchedulesPanel";
import { TeachersPanel } from "../features/admin/TeachersPanel";
import { UsersPanel } from "../features/admin/UsersPanel";

const SECTION_TITLES: Record<string, string> = {
  pendientes: "Pendientes",
  courses: "Cursos",
  catalog: "Catálogo",
  schedules: "Horarios",
  enrollments: "Matrículas",
  users: "Usuarios",
  teachers: "Profesores",
  rooms: "Aulas",
  holidays: "Festivos",
  reports: "Reportes",
  audit: "Auditoría",
};

export default function AdminDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";

  if (section === "inicio") return <InicioPanel />;

  const panels: Record<string, ReactNode> = {
    pendientes: <LocationProposalsPanel />,
    courses: <CoursesPanel />,
    catalog: <CatalogPanel />,
    schedules: <SchedulesPanel />,
    enrollments: <EnrollmentsPanel />,
    users: <UsersPanel />,
    teachers: <TeachersPanel />,
    rooms: <RoomsPanel />,
    holidays: <HolidaysPanel />,
    reports: <ReportView />,
    audit: <AuditPanel />,
  };

  return (
    <div>
      <PageTitle>{SECTION_TITLES[section] ?? "Administración"}</PageTitle>
      {panels[section] ?? <InicioPanel />}
    </div>
  );
}
