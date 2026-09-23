import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button, EmptyState } from "../components/ui";
import { IconCheck, IconChevronLeft } from "../components/icons";
import { apiErrorDetail, apiErrorMessage } from "../lib/api";
import { formatTime, modalityLabel } from "../lib/format";
import { notify } from "../lib/toast";
import {
  useBulkAttendance,
  useClassBoard,
  useCloseRegister,
  useCreateAttendance,
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
 */

const MARKS: { key: AttendanceStatus; letter: string; label: string; on: string }[] = [
  { key: "present", letter: "P", label: "Presente", on: "bg-emerald-600 border-emerald-600 text-white" },
  { key: "late", letter: "T", label: "Tarde", on: "bg-amber-600 border-amber-600 text-white" },
  { key: "absent", letter: "A", label: "Ausente", on: "bg-red-600 border-red-600 text-white" },
  { key: "excused", letter: "J", label: "Justificada", on: "bg-slate-600 border-slate-600 text-white" },
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

  const mark = useCreateAttendance();
  const bulk = useBulkAttendance();
  const markVisitor = useMarkMakeupVisitor(id);
  const close = useCloseRegister();
  const reopen = useReopenRegister();

  const [focused, setFocused] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  const students = board?.students ?? [];
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
      mark.mutate(
        { enrollment_id: student.enrollment_id, session_id: id, status },
        { onError: (e) => notify(apiErrorMessage(e, "No se pudo marcar"), "error") },
      );
    },
    [closed, id, mark],
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
    const items = students
      .filter((s) => !s.mark)
      .map((s) => ({ enrollment_id: s.enrollment_id, status: "present" as AttendanceStatus }));
    if (items.length === 0) return;
    bulk.mutate(
      { sessionId: id, items },
      {
        onSuccess: () => notify("Marcados como presentes", "success"),
        onError: (e) => notify(apiErrorMessage(e, "No se pudo marcar a todos"), "error"),
      },
    );
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
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Hoy
          </Link>
          <h1 className="mt-1.5 truncate text-2xl font-bold text-slate-900">
            {session.course_name}
          </h1>
          <p className="tabular mt-1 text-sm text-slate-600">{header}</p>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          {closed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <IconCheck className="h-3.5 w-3.5" />
              Lista cerrada
            </span>
          )}
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
          <Button variant="secondary" disabled={bulk.isPending} onClick={markEveryoneLeft}>
            {bulk.isPending ? "Marcando…" : "Los demás, presentes"}
          </Button>
        )}
      </div>

      <div ref={rowsRef} className="mt-4 flex-1 space-y-1">
        {students.map((student, i) => (
          <StudentRow
            key={student.enrollment_id}
            name={student.full_name}
            meta={student.enrollment_code}
            mark={student.mark}
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
                onMark={(present) =>
                  markVisitor.mutate(
                    { creditId: visitor.credit_id, present },
                    {
                      onSuccess: () =>
                        notify(present ? "Asistencia registrada" : "Marcado como ausente", "success"),
                      onError: (e) =>
                        notify(apiErrorMessage(e, "No se pudo marcar al alumno"), "error"),
                    },
                  )
                }
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

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur-xs">
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
            <p className="flex flex-wrap items-center gap-2 text-2xs text-slate-600">
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
                disabled={close.isPending || total === 0}
                variant={complete ? "primary" : "secondary"}
                onClick={() => closeRegister(false)}
              >
                {complete ? "Cerrar lista" : `Cerrar lista · faltan ${missing}`}
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
  );
}

function StudentRow({
  name,
  meta,
  mark,
  focused,
  disabled,
  onFocus,
  onMark,
}: {
  name: string;
  meta: string;
  mark: AttendanceStatus | null;
  focused: boolean;
  disabled: boolean;
  onFocus: () => void;
  onMark: (status: AttendanceStatus) => void;
}) {
  return (
    <div
      data-row
      className={`flex items-center gap-3.5 rounded-xl px-3 py-1.5 ${
        mark ? "" : "border border-slate-100 bg-white"
      } ${focused ? "ring-2 ring-brand-500/40" : ""}`}
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-2xs font-bold text-slate-600">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
        <div className="tabular text-2xs text-slate-500">{meta}</div>
      </div>
      <div className="flex flex-none gap-1.5" role="group" aria-label={`Asistencia de ${name}`}>
        {MARKS.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={disabled}
            aria-pressed={mark === m.key}
            aria-label={`${m.label} — ${name}`}
            onFocus={onFocus}
            onClick={() => onMark(m.key)}
            className={`h-11 w-11 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50 ${
              mark === m.key
                ? m.on
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            {m.letter}
          </button>
        ))}
      </div>
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
