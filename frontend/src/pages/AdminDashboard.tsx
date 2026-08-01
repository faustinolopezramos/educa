import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Button, EmptyState, PageHeader } from "../components/ui";
import { IconLock } from "../components/icons";
import { canSeeSection, defaultSection } from "../lib/nav";

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
import { StudentsPanel } from "../features/admin/StudentsPanel";
import { TeachersPanel } from "../features/admin/TeachersPanel";
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
  const { user } = useAuth();
  const section = params.get("m") ?? (user ? defaultSection(user.role) : "inicio");

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
    teachers: <TeachersPanel />,
    students: <StudentsPanel />,
    rooms: <RoomsPanel />,
    video_providers: <VideoProvidersPanel />,
    holidays: <HolidaysPanel />,
    reports: <ReportView />,
    audit: <AuditPanel />,
    perfil: <ProfilePanel />,
  };

  if (!canSeeSection(user, section)) return <SectionDenied />;

  return panels[section] ?? (user?.role === "superadmin" ? <TenantsPanel /> : <InicioPanel />);
}

function SectionDenied() {
  const [, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Sección no disponible" />
      <EmptyState
        icon={<IconLock className="h-5 w-5" />}
        title="No tienes acceso a esta sección"
        message="Tu cuenta no incluye este permiso. Si necesitas entrar, pídeselo a un administrador de la academia."
        action={
          <Button variant="secondary" onClick={() => setParams({ m: "inicio" })}>
            Volver al inicio
          </Button>
        }
      />
    </div>
  );
}
