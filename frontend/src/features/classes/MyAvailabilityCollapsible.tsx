import { useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { IconClock, IconClose, IconPlus } from "../../components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  Select,
  SkeletonRows,
  TimePicker,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS, dayName, formatTime } from "../../lib/format";
import {
  useAddAvailability,
  useDeleteAvailability,
  useTeacherAvailability,
  useTeacherLoad,
} from "../../lib/queries";
import { notify } from "../../lib/toast";

export function MyAvailabilityCollapsible() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || user.role !== "teacher") return null;

  return (
    <Card className="border border-slate-200">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center justify-between gap-3 p-1 select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <IconClock className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Mi Disponibilidad Semanal</h3>
            <p className="text-2xs text-slate-500">
              Consulta, agrega o libera tus ventanas de horario disponibles.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color="indigo">{isOpen ? "Ocultar" : "Ver y Gestionar"}</Badge>
          <span className="text-xs font-bold text-slate-400">
            {isOpen ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
          <AvailabilityContent teacherId={user.id} />
        </div>
      )}
    </Card>
  );
}

function AvailabilityContent({ teacherId }: { teacherId: number }) {
  const { data: availability = [], isLoading } = useTeacherAvailability(teacherId);
  const { data: load } = useTeacherLoad(teacherId);
  const addAvail = useAddAvailability();
  const deleteAvail = useDeleteAvailability();

  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sortedAvail = useMemo(() => {
    return [...availability].sort(
      (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    );
  }, [availability]);

  function handleAdd() {
    setErrorMsg(null);
    if (startTime >= endTime) {
      const msg = "La hora de inicio debe ser anterior a la hora de fin";
      setErrorMsg(msg);
      notify(msg, "error");
      return;
    }
    addAvail.mutate(
      {
        teacherId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      },
      {
        onSuccess: () => {
          setErrorMsg(null);
          notify("Bloque de disponibilidad agregado", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(e, "No se pudo agregar la disponibilidad");
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  function handleReleaseBlock(id: number) {
    setErrorMsg(null);
    deleteAvail.mutate(
      { teacherId, id },
      {
        onSuccess: () => {
          setErrorMsg(null);
          notify("Bloque de disponibilidad liberado", "success");
        },
        onError: (e) => {
          const msg = apiErrorMessage(
            e,
            "Advertencia: No se puede liberar el bloque por conflicto con una clase asignada.",
          );
          setErrorMsg(msg);
          notify(msg, "error");
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {load && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center justify-between text-xs gap-2">
          <span>
            <strong>Carga semanal declarada:</strong> {load.availability_hours}h / {load.max_hours}h máximas
          </span>
          <Badge color={load.percentage > 90 ? "amber" : "green"}>
            {load.assigned_hours}h asignadas a cursos
          </Badge>
        </div>
      )}

      {errorMsg && (
        <InlineAlert type="error">{errorMsg}</InlineAlert>
      )}

      {isLoading ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="space-y-3">
          {sortedAvail.length === 0 ? (
            <EmptyState
              icon={<IconClock className="h-5 w-5" />}
              title="Sin bloques de disponibilidad"
              message="Registra las ventanas de horario en las que estás disponible para impartir clases."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {sortedAvail.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Badge color="indigo">{dayName(item.day_of_week)}</Badge>
                    <span className="font-mono text-slate-800 font-semibold">
                      {formatTime(item.start_time)} – {formatTime(item.end_time)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteAvail.isPending}
                    onClick={() => handleReleaseBlock(item.id)}
                    title="Liberar bloque de horario"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <IconClose className="h-3.5 w-3.5" />
                    <span>Liberar</span>
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario rápido para Bloquear / Agregar nuevo horario */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
            <span className="text-2xs font-bold uppercase tracking-wider text-slate-600 block">
              Agregar / Bloquear nueva ventana de disponibilidad
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Día de semana</label>
                <Select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {DAYS.map((name, index) => (
                    <option key={index} value={index}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Hora Inicio</label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div>
                <label className="mb-1 block text-2xs font-medium text-slate-500">Hora Fin</label>
                <TimePicker value={endTime} onChange={setEndTime} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={addAvail.isPending} onClick={handleAdd}>
                <IconPlus className="h-4 w-4" />
                <span>{addAvail.isPending ? "Guardando…" : "Guardar Bloque"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
