import { useState } from "react";

import { Badge, Button, Modal, ModalActions } from "../../components/ui";
import { useChangeCourseStatus } from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage, apiErrorDetail } from "../../lib/api";
import type { Course, CourseStatus } from "../../lib/types";

/**
 * The course lifecycle, as a control rather than a label.
 *
 * A course used to have no state at all — whether it was still being set up,
 * taking enrolments, running or finished had to be guessed from its dates. So a
 * half-built course with no timetable and no teacher looked exactly like one
 * about to start, and students could be seated in it.
 *
 * Only legal moves are offered, which mirrors the API's own table. When the API
 * refuses one it has earned prerequisites to name, and those are shown here
 * rather than flattened into "no se pudo".
 */

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: "Borrador",
  open: "Abierto a matrícula",
  in_progress: "En curso",
  closed: "Cerrado",
  archived: "Archivado",
};

export const COURSE_STATUS_COLORS: Record<
  CourseStatus,
  "slate" | "green" | "indigo" | "amber" | "sky"
> = {
  draft: "slate",
  open: "green",
  in_progress: "indigo",
  closed: "amber",
  archived: "slate",
};

/** Mirrors `COURSE_TRANSITIONS` on the API. */
export const COURSE_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  draft: ["open", "archived"],
  open: ["in_progress", "draft", "archived"],
  in_progress: ["closed"],
  closed: ["archived", "in_progress"],
  archived: [],
};

/** What each move means, so the button is not a bare verb. */
const MOVE_HINTS: Partial<Record<CourseStatus, string>> = {
  open: "Los alumnos ya podrán matricularse.",
  in_progress: "Se cierra la preparación; el curso pasa a estar impartiéndose.",
  draft: "Vuelve a preparación y deja de admitir matrículas.",
  closed: "Termina el curso. Deja de admitir matrículas nuevas.",
  archived: "Lo saca del listado. Se conserva para el historial.",
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return <Badge color={COURSE_STATUS_COLORS[status]}>{COURSE_STATUS_LABELS[status]}</Badge>;
}

export function CourseStatusControl({ course }: { course: Course }) {
  const change = useChangeCourseStatus();
  const [pending, setPending] = useState<CourseStatus | null>(null);
  const [blockers, setBlockers] = useState<{ message: string; list: string[] } | null>(
    null,
  );

  const moves = COURSE_TRANSITIONS[course.status];

  function apply(target: CourseStatus) {
    change.mutate(
      { id: course.id, status: target },
      {
        onSuccess: () => {
          notify(
            `«${course.name}» pasó a ${COURSE_STATUS_LABELS[target].toLowerCase()}`,
            "success",
          );
          setPending(null);
        },
        onError: (e) => {
          const detail = apiErrorDetail(e);
          // The API answers a refused move with what is missing. Showing that
          // list is the difference between "no se pudo" and a to-do.
          if (detail && Array.isArray(detail.blockers) && detail.blockers.length > 0) {
            setPending(null);
            setBlockers({
              message: String(detail.message ?? "No se pudo cambiar el estado"),
              list: detail.blockers.map(String),
            });
            return;
          }
          notify(apiErrorMessage(e, "No se pudo cambiar el estado"), "error");
          setPending(null);
        },
      },
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <CourseStatusBadge status={course.status} />
        {moves.map((target) => (
          <Button
            key={target}
            variant="ghost"
            size="sm"
            disabled={change.isPending}
            onClick={() => setPending(target)}
          >
            {target === "archived" ? "Archivar" : COURSE_STATUS_LABELS[target]}
          </Button>
        ))}
      </div>

      {pending && (
        <Modal
          title={`Pasar «${course.name}» a ${COURSE_STATUS_LABELS[pending].toLowerCase()}`}
          description={MOVE_HINTS[pending]}
          onClose={() => setPending(null)}
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button onClick={() => apply(pending)} disabled={change.isPending}>
                {change.isPending ? "Aplicando…" : "Confirmar"}
              </Button>
            </ModalActions>
          }
        >
          <p className="text-sm text-slate-600">
            Estado actual: <strong>{COURSE_STATUS_LABELS[course.status]}</strong>. Podrás
            seguir moviéndolo después mientras el nuevo estado lo permita.
          </p>
        </Modal>
      )}

      {blockers && (
        <Modal
          title="Todavía no se puede"
          onClose={() => setBlockers(null)}
          footer={
            <ModalActions>
              <Button onClick={() => setBlockers(null)}>Entendido</Button>
            </ModalActions>
          }
        >
          <p className="mb-3 text-sm text-slate-600">{blockers.message}</p>
          <ul className="space-y-1.5">
            {blockers.list.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-800">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-amber-500" />
                {b}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
