import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { Button, Card, InlineAlert, MetaItem, PageHeader } from "../../components/ui";
import { useLocationProposals, useReport, useUsers } from "../../lib/queries";
import { SchedulePlanner } from "../schedules/SchedulePlanner";
import { PendingModal } from "./PendingModal";

export function InicioPanel() {
  const { user } = useAuth();
  const [, setParams] = useSearchParams();
  const { data: students = [] } = useUsers("student");
  const { data: pending = [] } = useLocationProposals("pending");
  const { data: report } = useReport("week");
  const [showPendingModal, setShowPendingModal] = useState(false);

  const attendance = report?.attendance_rate;
  const firstName = user?.full_name?.split(" ")[0] ?? "";

  return (
    <div>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Resumen"}
        description="Lo que ocurre en la academia esta semana."
        meta={
          <>
            <MetaItem value={students.length} label="alumnos" />
            <MetaItem value={report?.sessions_total ?? 0} label="clases esta semana" />
            <MetaItem
              value={attendance == null ? "—" : `${Math.round(attendance * 100)}%`}
              label="de asistencia"
            />
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setParams({ m: "courses" })}>
              Cursos
            </Button>
            <Button onClick={() => setParams({ m: "enrollments" })}>Nueva matrícula</Button>
          </>
        }
      />

      {/* Las propuestas pendientes se anuncian una sola vez.
          Antes existían tres accesos idénticos a la misma pantalla —una
          píldora en la cabecera, un botón junto a ella y este aviso— apilados
          en 200 px de alto. */}
      {pending.length > 0 && (
        <div className="mb-4">
          <InlineAlert
            type="warning"
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowPendingModal(true)}>
                Revisar
              </Button>
            }
          >
            {pending.length === 1
              ? "Hay 1 propuesta de aula o enlace pendiente de aprobación."
              : `Hay ${pending.length} propuestas de aula o enlace pendientes de aprobación.`}
          </InlineAlert>
        </div>
      )}

      <Card padding="sm">
        <SchedulePlanner />
      </Card>

      {showPendingModal && <PendingModal onClose={() => setShowPendingModal(false)} />}
    </div>
  );
}
