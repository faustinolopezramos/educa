import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button, EmptyState } from "../components/ui";
import { IconCheck, IconChevronLeft, IconPrinter, IconSun } from "../components/icons";
import { apiErrorDetail, apiErrorMessage } from "../lib/api";
import { useAttendanceQueue } from "../lib/attendanceQueue";
import { formatTime, modalityLabel } from "../lib/format";
import { triggerHaptic } from "../lib/haptics";
import { notify } from "../lib/toast";
import { useProjectorMode } from "../lib/useProjectorMode";
import {
  useClassBoard,
  useCloseRegister,
  useMarkMakeupVisitor,
  useReopenRegister,
} from "../lib/queries";
import type { AttendanceStatus, BoardStudent, MakeUpVisitor } from "../lib/types";

/**
 * Modo clase: la lista del día ocupa la pantalla.
 *
 * Lo que se hace durante una clase es marcar y cerrar, y eso es lo único que
 * está a la vista. Reprogramar y cancelar —que antes vivían permanentemente
 * encima de la lista, en la misma línea de visión que marcar asistencia— se
 * quedan en la pantalla de la clase, no aquí.
 *
 * El teclado es la vía rápida: P, T, A y J marcan al alumno enfocado y bajan al
 * siguiente, así que una lista de veinte se pasa sin tocar el ratón.
 *
 * En el móvil —que es con lo que se pasa lista dentro del aula— cada alumno
 * lleva los cuatro botones a todo el ancho, bajo su nombre, y el camino corto es
 * marcar sólo las faltas y pulsar «Los demás, presentes». Las marcas se ven al
 * instante y se guardan en el teléfono hasta que el servidor las confirma
 * (`useAttendanceQueue`): una wifi que se cae a mitad de clase no pierde nada.
 */

const MARKS: {
  key: AttendanceStatus;
  letter: string;
  label: string;
  /** La etiqueta bajo la letra en el móvil, donde no hay teclado que la recuerde. */
  short: string;
  on: string;
}[] = [
  { key: "present", letter: "P", label: "Presente", short: "Presente", on: "bg-emerald-600 border-emerald-600 text-white" },
  { key: "late", letter: "T", label: "Tarde", short: "Tarde", on: "bg-amber-600 border-amber-600 text-white" },
  { key: "absent", letter: "A", label: "Ausente", short: "Falta", on: "bg-red-600 border-red-600 text-white" },
  { key: "excused", letter: "J", label: "Justificada", short: "Justif.", on: "bg-slate-600 border-slate-600 text-white" },
];

const BY_LETTER: Record<string, AttendanceStatus> = {
  p: "present",
  t: "late",
  a: "absent",
  j: "excused",
};

export default function ClassMode() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const navigate = useNavigate();
  const { data: board, isLoading, isError } = useClassBoard(id);

  const queue = useAttendanceQueue(id);
  const markVisitor = useMarkMakeupVisitor(id);
  const close = useCloseRegister();
  const reopen = useReopenRegister();
  const { isProjector, toggle: toggleProjector } = useProjectorMode();

  const [focused, setFocused] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  // Lo que se ve es lo último que tocó el profesor, confirmado o no.
  const students = useMemo(
    () =>
      (board?.students ?? []).map((s) => ({
        ...s,
        mark: queue.pending[s.enrollment_id] ?? s.mark,
        unsent: s.enrollment_id in queue.pending,
      })),
    [board?.students, queue.pending],
  );
  const visitors = board?.visitors ?? [];
  const session = board?.session;

  const marked = students.filter((s) => s.mark).length;
  const total = students.length;
  const missing = total - marked;
  const complete = total > 0 && missing === 0;
  const closed = Boolean(session?.register_closed);
  // Cerrar la lista es del profesor titular de la franja. Un suplente asignado
  // al curso marca asistencia pero no cierra, así que aquí ni siquiera ve el
  // botón: antes lo veía, lo pulsaba y recibía un 403 sin explicación.
  const mayClose = Boolean(session?.can_close_register);

  const markStudent = useCallback(
    (student: BoardStudent, status: AttendanceStatus) => {
      if (closed) return;
      triggerHaptic(25);
      queue.mark(student.enrollment_id, status);
    },
    [closed, queue],
  );

  // El foco avanza solo: marcar es una tecla por alumno, no una tecla más una
  // flecha. Las flechas siguen estando para volver atrás y corregir.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (closed || students.length === 0) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      // Sin esto, Cmd+A (seleccionar todo) marcaba "ausente" al alumno enfocado.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const letter = event.key.toLowerCase();
      if (BY_LETTER[letter]) {
        event.preventDefault();
        const student = students[focused];
        if (student) {
          markStudent(student, BY_LETTER[letter]);
          setFocused((f) => Math.min(f + 1, students.length - 1));
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocused((f) => Math.min(f + 1, students.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocused((f) => Math.max(f - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closed, focused, students, markStudent]);

  useEffect(() => {
    const row = rowsRef.current?.querySelectorAll("[data-row]")[focused];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [focused]);

  function markEveryoneLeft() {
    const ids = students.filter((s) => !s.mark).map((s) => s.enrollment_id);
    if (ids.length > 0) {
      triggerHaptic([20, 40, 20]);
      queue.markMany(ids, "present");
    }
  }

  function closeRegister(force: boolean) {
    close.mutate(
      { id, force },
      {
        onSuccess: () => {
          setConfirming(false);
          notify("Lista cerrada", "success");
        },
        onError: (error) => {
          const detail = apiErrorDetail(error);
          if (detail?.reason === "incomplete_register" && !force) {
            setConfirming(true);
            return;
          }
          notify(apiErrorMessage(error, "No se pudo cerrar la lista"), "error");
        },
      },
    );
  }

  const header = useMemo(() => {
    if (!session) return null;
    const place = [modalityLabel(session.modality), session.room_name]
      .filter(Boolean)
      .join(" · ");
    return `${formatTime(session.start_time)}–${formatTime(session.end_time)} · ${place}`;
  }, [session]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-slate-500">Cargando la clase…</p>;
  }

  if (isError || !board || !session) {
    return (
      <EmptyState
        title="No se pudo abrir esta clase"
        message="Puede que no sea tuya o que ya no exista. Vuelve a tu jornada e inténtalo desde ahí."
        action={<Link to="/"><Button variant="secondary">Volver a hoy</Button></Link>}
      />
    );
  }

  return (
    <div className="min-h-full">
      <div className="flex min-h-full flex-col print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Hoy
          </Link>
          <h1 className="mt-1.5 truncate text-xl font-bold text-slate-900 sm:text-2xl">
            {session.course_name}
          </h1>
          <p className="tabular mt-1 text-sm text-slate-600">{header}</p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {closed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <IconCheck className="h-3.5 w-3.5" />
              Lista cerrada
            </span>
          )}
          <Button
            variant={isProjector ? "primary" : "secondary"}
            onClick={toggleProjector}
            title={
              isProjector
                ? "Modo proyector activo (alto contraste)"
                : "Activar modo proyector (alto contraste para aulas o luz solar)"
            }
            className={isProjector ? "border-amber-400 bg-amber-500 text-slate-950 font-bold hover:bg-amber-400" : ""}
          >
            <IconSun className="h-4 w-4" />
            <span className="hidden sm:inline">{isProjector ? "Proyector: ON" : "Proyector"}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.print()}
            title="Imprimir hoja oficial de asistencia para respaldo o firmas"
          >
            <IconPrinter className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir lista</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/?m=ludi")}
            title="Abrir Quizzes con IA, Partida en Vivo con PIN y Gamificación"
            className="border-brand-300 text-brand-700 hover:bg-brand-50"
          >
            🎮 Ludi IA & Quizzes
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/?m=clases")}
            title="Reprogramar, cancelar o fijar la ubicación de esta clase"
          >
            Gestionar clase
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex-none">
          <div className="tabular text-xl font-bold text-slate-900">
            {marked}
            <span className="ml-1 text-sm font-semibold text-slate-600">de {total}</span>
          </div>
          <div className="text-2xs text-slate-500">marcados</div>
        </div>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuenow={marked}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Alumnos marcados"
        >
          <div
            className={`h-full rounded-full ${complete ? "bg-emerald-600" : "bg-brand-500"}`}
            style={{ width: `${total ? (marked / total) * 100 : 0}%` }}
          />
        </div>
        {!closed && missing > 0 && (
          <Button variant="secondary" className="w-full sm:w-auto" onClick={markEveryoneLeft}>
            {marked === 0 ? "Todos presentes" : "Los demás, presentes"}
          </Button>
        )}
      </div>

      <ConnectionNotice count={queue.count} offline={queue.offline} />

      <div ref={rowsRef} className="mt-4 flex-1 space-y-1">
        {students.map((student, i) => (
          <StudentRow
            key={student.enrollment_id}
            name={student.full_name}
            meta={student.enrollment_code}
            mark={student.mark}
            unsent={student.unsent}
            focused={i === focused && !closed}
            disabled={closed}
            onFocus={() => setFocused(i)}
            onMark={(status) => markStudent(student, status)}
          />
        ))}

        {visitors.length > 0 && (
          <div className="pt-4">
            <div className="mb-2 flex items-center gap-3">
              <h2 className="text-xs font-bold text-brand-700">En recuperación</h2>
              <span className="h-px flex-1 bg-brand-100" />
              <span className="text-xs text-slate-600">vienen de otro grupo con un pase</span>
            </div>
            {visitors.map((visitor) => (
              <VisitorRow
                key={visitor.credit_id}
                visitor={visitor}
                disabled={closed || markVisitor.isPending}
                onMark={(present) => {
                  triggerHaptic(25);
                  markVisitor.mutate(
                    { creditId: visitor.credit_id, present },
                    {
                      onSuccess: () =>
                        notify(present ? "Asistencia registrada" : "Marcado como ausente", "success"),
                      onError: (e) =>
                        notify(apiErrorMessage(e, "No se pudo marcar al alumno"), "error"),
                    },
                  );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {confirming && !closed && mayClose && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {missing === 1
                ? "Falta un alumno por marcar"
                : `Faltan ${missing} alumnos por marcar`}
            </p>
            <p className="text-xs text-amber-800">
              Al cerrar, quien no tenga marca queda sin registrar en esta clase.
            </p>
          </div>
          <div className="flex flex-none gap-2.5">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Seguir marcando
            </Button>
            <Button
              className="bg-amber-700 hover:bg-amber-800"
              disabled={close.isPending}
              onClick={() => closeRegister(true)}
            >
              Cerrar así
            </Button>
          </div>
        </div>
      )}

      <div
        className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 pt-3 backdrop-blur-xs sm:gap-4 sm:pt-4"
        // El borde inferior del iPhone tapa el botón de cerrar sin este margen.
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {closed ? (
          <>
            <p className="text-xs text-slate-600">
              La lista quedó cerrada. Reábrela si necesitas corregir una marca.
            </p>
            <div className="flex flex-none gap-2.5">
              {mayClose && (
              <Button
                variant="secondary"
                disabled={reopen.isPending}
                onClick={() =>
                  reopen.mutate(id, {
                    onSuccess: () => notify("Lista reabierta", "success"),
                    onError: (e) =>
                      notify(apiErrorMessage(e, "No se pudo reabrir"), "error"),
                  })
                }
              >
                Reabrir
              </Button>
              )}
              <Button onClick={() => navigate("/")}>Volver a hoy</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-2xs text-slate-600 sm:hidden">
              Marca sólo las faltas y pulsa «Los demás, presentes».
            </p>
            <p className="hidden flex-wrap items-center gap-2 text-2xs text-slate-600 sm:flex">
              <span>Sin soltar el teclado:</span>
              {MARKS.map((m) => (
                <span key={m.key} className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-300 border-b-2 bg-white px-1.5 py-0.5 font-sans text-2xs font-bold text-slate-700">
                    {m.letter}
                  </kbd>
                  {m.label.toLowerCase()}
                </span>
              ))}
              <span className="text-slate-500">la lista avanza sola</span>
            </p>
            {mayClose ? (
              <Button
                // Con marcas todavía en el teléfono, cerrar dejaría fuera justo
                // las que no han llegado: primero que se envíen.
                disabled={close.isPending || total === 0 || queue.count > 0}
                variant={complete ? "primary" : "secondary"}
                className="w-full sm:w-auto"
                onClick={() => closeRegister(false)}
              >
                {queue.count > 0
                  ? "Enviando marcas…"
                  : complete
                    ? "Cerrar lista"
                    : `Cerrar lista · faltan ${missing}`}
              </Button>
            ) : (
              <p className="text-2xs text-slate-600">
                La cierra {session.teacher_name}, titular de esta franja.
              </p>
            )}
          </>
        )}
      </div>
      </div>

      {/* Hoja oficial de asistencia para impresión física / respaldo */}
      <div className="hidden print:block font-sans text-black p-4">
        <div className="border-b-2 border-black pb-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold uppercase tracking-tight">{session.course_name}</h1>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">Control Oficial de Asistencia y Aula</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p><strong>Fecha:</strong> {session.date}</p>
              <p><strong>Horario:</strong> {formatTime(session.start_time)} – {formatTime(session.end_time)}</p>
              <p><strong>Modalidad:</strong> {modalityLabel(session.modality)} {session.room_name ? `(${session.room_name})` : ""}</p>
              <p><strong>Docente:</strong> {session.teacher_name}</p>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse border border-black text-xs mb-6">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-2 py-1.5 text-center w-8">#</th>
              <th className="border border-black px-3 py-1.5 text-left">Estudiante</th>
              <th className="border border-black px-2 py-1.5 text-center w-28">Código Matrícula</th>
              <th className="border border-black px-3 py-1.5 text-center w-32">Estado</th>
              <th className="border border-black px-3 py-1.5 text-left">Firma del Alumno / Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, idx) => (
              <tr key={s.enrollment_id} className="border-b border-black">
                <td className="border border-black px-2 py-2 text-center font-bold">{idx + 1}</td>
                <td className="border border-black px-3 py-2 font-medium">{s.full_name}</td>
                <td className="border border-black px-2 py-2 text-center font-mono">{s.enrollment_code}</td>
                <td className="border border-black px-3 py-2 text-center font-bold">
                  {s.mark === "present"
                    ? "PRESENTE"
                    : s.mark === "late"
                    ? "TARDE"
                    : s.mark === "absent"
                    ? "AUSENTE"
                    : s.mark === "excused"
                    ? "JUSTIFICADA"
                    : "[   ]"}
                </td>
                <td className="border border-black px-3 py-2"></td>
              </tr>
            ))}
            {visitors.map((v, idx) => (
              <tr key={v.credit_id} className="border-b border-black bg-slate-50">
                <td className="border border-black px-2 py-2 text-center font-bold">{students.length + idx + 1}</td>
                <td className="border border-black px-3 py-2 font-medium">
                  {v.student_name} <span className="text-2xs italic">(Recuperación)</span>
                </td>
                <td className="border border-black px-2 py-2 text-center font-mono">—</td>
                <td className="border border-black px-3 py-2 text-center font-bold">
                  {v.status === "attended" ? "PRESENTE" : "[   ]"}
                </td>
                <td className="border border-black px-3 py-2"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 pt-6 mt-6 border-t border-black text-xs">
          <div>
            <p><strong>Resumen de Asistencia:</strong></p>
            <p className="mt-1">Total matriculados: {total} {visitors.length > 0 ? `(+ ${visitors.length} recuperación)` : ""}</p>
            <p>Registrados: {marked} | Pendientes: {missing}</p>
          </div>
          <div className="text-center pt-8 border-t border-black">
            <p className="font-semibold">{session.teacher_name}</p>
            <p className="text-2xs text-slate-600">Firma del Docente Titular</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentRow({
  name,
  meta,
  mark,
  unsent,
  focused,
  disabled,
  onFocus,
  onMark,
}: {
  name: string;
  meta: string;
  mark: AttendanceStatus | null;
  unsent: boolean;
  focused: boolean;
  disabled: boolean;
  onFocus: () => void;
  onMark: (status: AttendanceStatus) => void;
}) {
  return (
    <div
      data-row
      className={`flex flex-col gap-2 rounded-xl px-3 py-2 sm:flex-row sm:items-center sm:gap-3.5 sm:py-1.5 ${
        mark ? "" : "border border-slate-100 bg-white"
      } ${focused ? "ring-2 ring-brand-500/40" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-2xs font-bold text-slate-600">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
          <div className="tabular flex items-center gap-1.5 text-2xs text-slate-500">
            {meta}
            {unsent && (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                sin enviar
              </span>
            )}
          </div>
        </div>
      </div>
      {/* En el móvil, los cuatro botones a todo el ancho y con su nombre:
          un dedo acierta mejor en un cuarto de pantalla que en 44 px. */}
      <div
        className="grid flex-none grid-cols-4 gap-1.5 sm:flex"
        role="group"
        aria-label={`Asistencia de ${name}`}
      >
        {MARKS.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={disabled}
            aria-pressed={mark === m.key}
            aria-label={`${m.label} — ${name}`}
            onFocus={onFocus}
            onClick={() => onMark(m.key)}
            className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-bold transition-colors disabled:opacity-50 sm:h-11 sm:w-11 ${
              mark === m.key
                ? m.on
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            <span>{m.letter}</span>
            <span className="text-2xs font-medium leading-tight sm:hidden">{m.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Qué pasa con las marcas que todavía no llegaron. Sin conexión lo dice claro
 * —y tranquiliza—; con conexión no molesta: el punto "sin enviar" de cada fila
 * basta mientras el envío tarda un instante.
 */
function ConnectionNotice({ count, offline }: { count: number; offline: boolean }) {
  if (count === 0 || !offline) return null;
  return (
    <div
      role="status"
      className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-semibold">Sin conexión</p>
      <p className="text-xs text-amber-800">
        {count === 1 ? "Una marca guardada" : `${count} marcas guardadas`} en este teléfono. Se
        enviarán solas en cuanto vuelva la conexión; puedes seguir pasando lista.
      </p>
    </div>
  );
}

function VisitorRow({
  visitor,
  disabled,
  onMark,
}: {
  visitor: MakeUpVisitor;
  disabled: boolean;
  onMark: (present: boolean) => void;
}) {
  const done = visitor.status === "attended";
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-brand-100 bg-white px-3 py-1.5">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700">
        {initials(visitor.student_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">
          {visitor.student_name}
        </div>
        <div className="truncate text-2xs text-brand-700">
          Viene de {visitor.origin_course_name ?? "otro grupo"}
        </div>
      </div>
      {done ? (
        <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-2xs font-semibold text-emerald-700">
          <IconCheck className="h-3 w-3" />
          Asistió
        </span>
      ) : (
        <div className="flex flex-none gap-1.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMark(true)}
            className="h-11 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-50"
          >
            Presente
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onMark(false)}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"
          >
            Ausente
          </button>
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
