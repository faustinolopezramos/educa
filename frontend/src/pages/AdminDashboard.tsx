import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { PageTitle } from "../components/ui";
import { AuditPanel } from "../features/audit/AuditPanel";
import { ReportView } from "../features/reports/ReportView";
import { CatalogPanel } from "../features/admin/CatalogPanel";
import { CoursesAndTeachersHub } from "../features/admin/CoursesAndTeachersHub";
import { EnrollmentsPanel } from "../features/admin/EnrollmentsPanel";
import { HolidaysPanel } from "../features/admin/HolidaysPanel";
import { InicioPanel } from "../features/admin/InicioPanel";
import { LocationProposalsPanel } from "../features/admin/LocationProposalsPanel";
import { RoomsPanel } from "../features/admin/RoomsPanel";
import { TenantsPanel } from "../features/admin/TenantsPanel";
import { UsersPanel } from "../features/admin/UsersPanel";
import { VideoProvidersPanel } from "../features/admin/VideoProvidersPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";

const SECTION_TITLES: Record<string, string> = {
  tenants: "Academias / Tenants",
  pendientes: "Pendientes",
  courses: "Gestión de Cursos",
  catalog: "Estructura y Parámetros de la Academia",
  schedules: "Planificador de Horarios Académicos",
  enrollments: "Matrículas",
  users: "Gestión de Usuarios",
  rooms: "Aulas",
  video_providers: "Videoconferencias",
  holidays: "Festivos",
  reports: "Reportes",
  audit: "Auditoría",
  perfil: "Mi perfil",
};

export default function AdminDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";

  if (section === "inicio") return <InicioPanel />;

  const hub = <CoursesAndTeachersHub />;

  const panels: Record<string, ReactNode> = {
    tenants: <TenantsPanel />,
    pendientes: <LocationProposalsPanel />,
    courses: hub,
    schedules: hub,
    catalog: <CatalogPanel />,
    enrollments: <EnrollmentsPanel />,
    users: <UsersPanel />,
    rooms: <RoomsPanel />,
    video_providers: <VideoProvidersPanel />,
    holidays: <HolidaysPanel />,
    reports: <ReportView />,
    audit: <AuditPanel />,
    perfil: <ProfilePanel />,
  };

  return (
    <div>
      <PageTitle>{SECTION_TITLES[section] ?? "Administración"}</PageTitle>
      {panels[section] ?? <InicioPanel />}
    </div>
  );
}
