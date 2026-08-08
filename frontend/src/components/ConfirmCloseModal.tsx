import { IconCheck } from "./icons";
import { Badge, Button, Modal, ModalActions } from "./ui";

export interface UnmarkedStudent {
  id: number;
  name: string;
}

export interface ConfirmCloseModalProps {
  isOpen: boolean;
  unmarkedStudents: UnmarkedStudent[];
  totalStudents: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmCloseModal({
  isOpen,
  unmarkedStudents,
  totalStudents,
  isPending,
  onClose,
  onConfirm,
}: ConfirmCloseModalProps) {
  if (!isOpen) return null;

  const count = unmarkedStudents.length;

  return (
    <Modal
      title="Confirmar Cierre de Lista"
      description={
        count > 0
          ? `Hay ${count} de ${totalStudents} alumnos sin marca de asistencia.`
          : "Todos los alumnos han sido marcados."
      }
      onClose={onClose}
      footer={
        <ModalActions
          hint={
            count > 0
              ? "Los alumnos no marcados quedarán sin registro de asistencia"
              : undefined
          }
        >
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Volver a editar
          </Button>
          <Button
            variant={count > 0 ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Cerrando…" : "Confirmar y Cerrar"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        {count > 0 ? (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold mb-0.5">
                Tienes {count} alumno{count === 1 ? "" : "s"} sin marcar
              </p>
              <p className="text-amber-800 text-2xs">
                Si confirmas el cierre ahora, la clase se dará por terminada con la
                lista a medias. Puedes volver a editar para registrarlos.
              </p>
            </div>

            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">
                Alumnos pendientes ({count}):
              </span>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                {unmarkedStudents.map((s) => (
                  <div
                    key={s.id}
                    className="px-3 py-2 text-xs font-medium text-slate-700 flex items-center justify-between"
                  >
                    <span>{s.name}</span>
                    <Badge color="amber">Pendiente</Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center gap-3">
            <IconCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-emerald-900">¡Todos los alumnos marcados!</p>
              <p className="text-emerald-700 text-2xs mt-0.5">
                Se han registrado los {totalStudents} alumnos. ¿Deseas dar por
                terminada y oficializar la lista de esta clase?
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
