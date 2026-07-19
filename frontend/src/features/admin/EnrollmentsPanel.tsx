import { useState } from "react";

import {
  Badge, Button, Card, Table, Td, Th,
} from "../../components/ui";
import { EnrollWizard } from "../enrollments/EnrollWizard";
import {
  useCourses, useEnrollmentCertificate, useEnrollments, useFinalGrade, useIssueCertificate, useUpdateEnrollment, useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Enrollment } from "../../lib/types";
import { onMutationError } from "./shared";

export function EnrollmentsPanel() {
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: students = [] } = useUsers("student");
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setWizardOpen(true)}>+ Matricular alumno</Button>
      </div>
      {wizardOpen && <EnrollWizard onClose={() => setWizardOpen(false)} />}
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Alumno</Th>
              <Th>Curso</Th>
              <Th>Estado</Th>
              <Th>Pago</Th>
              <Th>Asiste</Th>
              <Th>Certificado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {enrollments.map((e) => (
              <tr key={e.id}>
                <Td>
                  {students.find((s) => s.id === e.student_id)?.full_name ??
                    e.student_id}
                </Td>
                <Td>{courses.find((c) => c.id === e.course_id)?.name ?? e.course_id}</Td>
                <Td>
                  <Badge color={e.status === "active" ? "green" : "slate"}>
                    {e.status}
                  </Badge>
                </Td>
                <Td>
                  <Badge
                    color={
                      e.payment_status === "paid"
                        ? "green"
                        : e.payment_status === "overdue"
                          ? "red"
                          : "amber"
                    }
                  >
                    {e.payment_status}
                  </Badge>
                </Td>
                <Td>
                  <AttendanceToggle enrollment={e} />
                </Td>
                <Td>
                  <CertificateCell enrollmentId={e.id} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function AttendanceToggle({ enrollment }: { enrollment: Enrollment }) {
  const update = useUpdateEnrollment();
  const blocked = enrollment.attendance_blocked;
  return (
    <button
      type="button"
      disabled={enrollment.status !== "active" || update.isPending}
      onClick={() =>
        update.mutate(
          { id: enrollment.id, attendance_blocked: !blocked },
          {
            onSuccess: () =>
              notify(
                blocked ? "Puede asistir a clases" : "Bloqueado para clases",
                "success",
              ),
            onError: onMutationError("No se pudo actualizar"),
          },
        )
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
        enrollment.status !== "active"
          ? "cursor-not-allowed opacity-40"
          : blocked
            ? "bg-red-100 text-red-700 hover:bg-red-200"
            : "bg-green-100 text-green-700 hover:bg-green-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${blocked ? "bg-red-600" : "bg-green-600"}`} />
      {blocked ? "Bloqueado" : "Permitido"}
    </button>
  );
}

function CertificateCell({ enrollmentId }: { enrollmentId: number }) {
  const { data: final } = useFinalGrade(enrollmentId);
  const { data: certificate } = useEnrollmentCertificate(enrollmentId);
  const issue = useIssueCertificate();

  if (certificate) {
    return <span className="text-xs text-green-700">Emitido · {certificate.code}</span>;
  }
  if (!final || !final.passed) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <Button
      variant="secondary"
      className="px-2 py-1 text-xs"
      disabled={issue.isPending}
      onClick={() =>
        issue.mutate(enrollmentId, {
          onSuccess: () => notify("Certificado emitido", "success"),
          onError: onMutationError("No se pudo emitir"),
        })
      }
    >
      Emitir
    </Button>
  );
}
