import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

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

/**
 * Each panel renders its own <PageHeader>, so this file only routes.
 *
 * It used to print a <PageTitle> above whatever panel it mounted, while every
 * panel also drew its own title bar — so each admin screen opened with its name
 * written twice, in two different type styles, one under the other.
 */
export default function AdminDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";

  const hub = <CoursesAndTeachersHub />;

  const panels: Record<string, ReactNode> = {
    inicio: <InicioPanel />,
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

  return panels[section] ?? <InicioPanel />;
}
