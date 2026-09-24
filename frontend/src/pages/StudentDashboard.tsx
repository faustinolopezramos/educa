import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import {
  Badge, Button, Card, EmptyState, PageHeader, SectionHeading, SegmentedControl,
  SkeletonRows,
} from "../components/ui";
import { ActionTray } from "../components/ActionTray";
import {
  IconBook, IconChevronRight, IconClock, IconLock, IconPin,
} from "../components/icons";
import { StudentGrades } from "../features/grades/StudentGrades";
import { StudentKardexView } from "../features/grades/StudentKardexView";
import { AssignmentsPanel } from "../features/assignments/AssignmentsPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";
import { ReportView } from "../features/reports/ReportView";
import {
  DAYS,
  ENROLLMENT_LABELS,
  PAYMENT_LABELS,
  courseModality,
  courseModalityLabel,
  formatDateTime,
  formatTime,
  localDow,
  locationSummary,
  timeZoneLabel,
} from "../lib/format";
import { attendancePct } from "../lib/attendance";
import { isCurrentEnrollment, isDelinquent } from "../lib/enrollment";
import { nextClassStatusLine } from "../lib/studentHome";
import {
  useCourses,
  useDashboard,
  useEnrollments,
  useFinalGrade,
  useGrades,
  useHolidays,
  useLevels,
  useMakeUpCredits,
  useMySessions,
  usePublicTeachers,
  useRooms,
  useSchedules,
  useVisibleAttendance,
} from "../lib/queries";
import { LOBBY_WINDOW_MIN, GRACE_MS } from "../lib/constants";
import { Modal, ModalActions } from "../components/ui";
import { MakeUpBookingModal } from "../features/classes/MakeUpBookingModal";
import type { Enrollment, MakeUpCredit, Modality } from "../lib/types";

function sessionStartMs(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

export default function StudentDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";
  const { data: enrollments = [] } = useEnrollments();
  // Solvency is a property of the student, not of one course: a single overdue
  // fee closes grades, final grades and the report everywhere. `isDelinquent`
  // is the same rule the API applies in `student_is_solvent`.
  const isOverdue = useMemo(() => enrollments.some(isDelinquent), [enrollments]);

  if (section === "tareas") return <AssignmentsPanel />;
  // "Calificaciones" and "Reporte" were two menu entries answering the same
  // question — how am I doing — and a student had to know which one held the
  // number they wanted. They are one section with two views now.
  if (
    section === "progreso" ||
    section === "calificaciones" ||
    section === "reportes" ||
    section === "kardex"
  ) {
    return <ProgressView isOverdue={isOverdue} initial={section} />;
  }
  if (section === "perfil") return <ProfilePanel />;
  return <WeekView isOverdue={isOverdue} />;
}

function ProgressView({
  isOverdue,
  initial,
}: {
  isOverdue: boolean;
  /** Honours the old section ids, so a bookmark still lands where it used to. */
  initial: string;
}) {
  const [view, setView] = useState<"notas" | "avance" | "expediente">(
    initial === "reportes"
      ? "avance"
      : initial === "kardex" || initial === "expediente"
        ? "expediente"
        : "notas",
  );

  return (
    <div>
      <PageHeader
        title="Mi progreso"
        description="Tus notas por curso, avance del periodo y expediente oficial (Kardex)."
      />
      <div className="mb-4">
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "notas", label: "Notas" },
            { value: "avance", label: "Avance del periodo" },
            { value: "expediente", label: "Expediente Oficial (Kardex)" },
          ]}
        />
      </div>
      {isOverdue && view !== "expediente" ? (
        <PaymentGate what={view === "notas" ? "tus notas" : "tu avance"} />
      ) : view === "notas" ? (
        <StudentGrades />
      ) : view === "avance" ? (
        <StudentReport />
      ) : (
        <StudentKardexView />
      )}
    </div>
  );
}

/**
 * Pantalla que ve un alumno con la cuota vencida. Un solo componente para los
 * dos sitios donde aplica: antes eran dos bloques con textos distintos que
 * decían lo mismo.
 */
function PaymentGate({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<IconLock className="h-5 w-5" />}
      title={`Ponte al día para ver ${what}`}
      message="El acceso se restablece en cuanto se registre tu pago. Si ya pagaste, avisa a administración para que actualicen tu estado."
    />
  );
}

// The progress report is only shown to students who are up to date on payments.
function StudentReport() {
  const { data: enrollments = [], isLoading } = useEnrollments();

  if (isLoading) return <SkeletonRows rows={4} />;
  if (enrollments.some(isDelinquent)) return <PaymentGate what="tu reporte" />;

  return <ReportView />;
}

function WeekView({ isOverdue }: { isOverdue: boolean }) {
  const { user } = useAuth();
  const tz = user?.timezone;
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: levels = [] } = useLevels();
  const { data: schedules = [] } = useSchedules();
  const { data: sessions = [] } = useMySessions();
  const { data: teachers = [] } = usePublicTeachers();
  const { data: rooms = [] } = useRooms();
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: holidays = [] } = useHolidays();
  const { data: grades = [] } = useGrades(undefined, !isOverdue);
  const { data: makeups = [] } = useMakeUpCredits();

  const now = Date.now();
  const todayDow = localDow();
  const [selectedDow, setSelectedDow] = useState<number>(todayDow);
  const [selectedCourseForModal, setSelectedCourseForModal] = useState<Enrollment | null>(null);
  const [selectedMakeUp, setSelectedMakeUp] = useState<MakeUpCredit | null>(null);

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? "—";
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);
  /** Cómo se imparte un curso, deducido de sus franjas. */
  const modalityOf = (courseId: number) =>
    courseModality(schedules.filter((s) => s.course_id === courseId));

  const current = enrollments.filter((e) => isCurrentEnrollment(e.status));
  const history = enrollments.filter((e) => !isCurrentEnrollment(e.status));

  const myCourseIds = new Set(current.map((e) => e.course_id));
  const mySchedules = schedules
    .filter((s) => myCourseIds.has(s.course_id))
    .sort(
      (a, b) =>
        a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    );
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  const myMeetings = sessions
    .map((sess) => {
      const sched = scheduleById.get(sess.schedule_id);
      if (!sched) return null;
      const start = sessionStartMs(sess.date, sched.start_time);
      const opensAt = start - LOBBY_WINDOW_MIN * 60_000;
      const closeAt = start + GRACE_MS;
      const active = sess.status !== "cancelled";
      return { sess, sched, start, opensAt, closeAt, active };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.closeAt > now && x.active)
    .sort((a, b) => a.start - b.start);

  const next = myMeetings[0] ?? null;

  const statsByCourse = new Map<
    number,
    { attendancePct: number | null; average: number | null }
  >();
  for (const e of enrollments) {
    const pct = attendancePct(
      attendance.filter((a) => a.enrollment_id === e.id).map((a) => a.status),
    );
    const gr = grades.filter((g) => g.enrollment_id === e.id);
    const average = gr.length
      ? Math.round((gr.reduce((s, g) => s + g.score, 0) / gr.length) * 10) / 10
      : null;
    statsByCourse.set(e.course_id, { attendancePct: pct, average });
  }

  const nextClassForCourse = (courseId: number): string | null => {
    const n = myMeetings.find((x) => x.sched.course_id === courseId);
    return n ? formatDateTime(new Date(n.start).toISOString(), tz) : null;
  };

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.full_name?.split(" ")[0] ?? ""}`}
        description={nextClassStatusLine(next?.start ?? null, now)}
      />

      <DebtBanner />

      <ActionTray
        title="Pendientes"
        emptyMessage="No tienes pendientes. Todo al día."
        // El aviso de cuota vencida sale aparte, con más espacio: aquí sería
        // una fila más del mismo peso que "una tarea sin entregar".
        exclude={["payment_overdue"]}
      />

      {makeups.length > 0 && (
        <div className="mb-6 rounded-2xl border border-brand-200/80 bg-gradient-to-r from-brand-50/70 via-indigo-50/40 to-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-brand-900 text-sm flex items-center gap-2">
                <span>🎟️</span> Pases de Recuperación de Clase ({makeups.length})
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {makeups.filter((m) => m.status === "available").length > 0
                  ? `Tienes ${makeups.filter((m) => m.status === "available").length} pase(s) disponible(s) para agendar en clases paralelas de tu nivel.`
                  : "Todas tus recuperaciones están agendadas o completadas."}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {makeups.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Pase #{m.id} · {m.level_name ?? "Nivel MCER"}
                    </span>
                    <span
                      className={`text-3xs font-semibold px-2 py-0.5 rounded-full ${
                        m.status === "available"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : m.status === "booked"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m.status === "available"
                        ? "Disponible"
                        : m.status === "booked"
                          ? "Agendada"
                          : m.status === "attended"
                            ? "Completada"
                            : m.status}
                    </span>
                  </div>
                  {m.status === "booked" ? (
                    <p className="text-2xs text-blue-800 font-medium mt-1">
                      📅 {m.target_session_date} {m.target_session_time && `· ${m.target_session_time}`}
                      {m.target_course_name && ` (${m.target_course_name})`}
                    </p>
                  ) : (
                    <p className="text-2xs text-slate-500 mt-1">
                      Vence: {m.expires_at} {m.notes && `· ${m.notes}`}
                    </p>
                  )}
                </div>

                <div className="flex-none">
                  {m.status === "available" && (
                    <Button
                      size="sm"
                      className="text-xs bg-brand-600 hover:bg-brand-700 text-white font-medium"
                      onClick={() => setSelectedMakeUp(m)}
                    >
                      Agendar →
                    </Button>
                  )}
                  {m.status === "booked" && m.target_session_id && (
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/lobby/${m.target_session_id}`}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 transition"
                      >
                        Entrar al Aula →
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-2xs text-slate-500"
                        onClick={() => setSelectedMakeUp(m)}
                        title="Ver o cancelar reserva"
                      >
                        Gestionar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {next ? (
            <NextClassHero
              courseName={courseName(next.sched.course_id)}
              teacher={teacherName(next.sched.teacher_id)}
              modality={next.sched.modality}
              room={roomName(next.sched.room_id)}
              start={next.start}
              opensAt={next.opensAt}
              sessionId={next.sess.id}
              tz={tz}
              topic={next.sess.topic}
            />
          ) : (
            <Card className="h-full">
              <EmptyState
                icon={<IconClock className="h-5 w-5" />}
                title="No tienes clases próximas"
                message="Cuando se acerque una clase la verás aquí, con el acceso directo al aula."
              />
            </Card>
          )}
        </div>

        {/* Interactive Week Calendar & Agenda */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionHeading>Esta semana</SectionHeading>
              <span className="text-2xs text-slate-400 font-medium">Toca un día para ver detalle</span>
            </div>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => {
                const dayClasses = mySchedules.filter((s) => s.day_of_week === i);
                const has = dayClasses.length > 0;
                const isToday = i === todayDow;
                const isSelected = i === selectedDow;

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDow(i)}
                    className={`flex-1 rounded-lg py-1.5 text-center transition-all ${
                      isSelected
                        ? "bg-slate-100 ring-2 ring-brand-600 font-semibold"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`text-2xs font-semibold ${
                        isToday ? "text-brand-700 font-bold" : "text-slate-500"
                      }`}
                    >
                      {d.slice(0, 2)}
                    </div>
                    <div
                      className={`mx-auto mt-1 h-2 w-2 rounded-full ${
                        has ? "bg-brand-600" : "bg-slate-200"
                      } ${isToday ? "ring-2 ring-brand-300 ring-offset-1" : ""}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Agenda of the selected day */}
          <div className="mt-4 border-t border-slate-100 pt-3 text-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">
                {DAYS[selectedDow]} {selectedDow === todayDow && "(Hoy)"}
              </span>
              {(() => {
                const count = mySchedules.filter((s) => s.day_of_week === selectedDow).length;
                return (
                  <span className="text-2xs text-slate-400">
                    {count === 0 ? "Sin clases" : count === 1 ? "1 clase" : `${count} clases`}
                  </span>
                );
              })()}
            </div>

            {(() => {
              // Check if selected day this week is a holiday
              const d = new Date();
              const currDow = localDow();
              const diff = selectedDow - currDow;
              d.setDate(d.getDate() + diff);
              const dateStr = d.toISOString().slice(0, 10);
              const holiday = holidays.find((h) => h.date === dateStr);

              const dayClasses = mySchedules.filter((s) => s.day_of_week === selectedDow);

              return (
                <div className="space-y-2">
                  {holiday && (
                    <div className="rounded-lg bg-amber-50 p-2 border border-amber-200 text-amber-900 text-2xs">
                      🎉 <strong>Feriado escolar:</strong> {holiday.name}
                    </div>
                  )}
                  {dayClasses.length === 0 ? (
                    <p className="text-slate-400 italic py-2 text-center">
                      No tienes clases programadas para este día.
                    </p>
                  ) : (
                    dayClasses.map((s) => {
                      const cName = courseName(s.course_id);
                      const tName = teacherName(s.teacher_id);
                      const rName = roomName(s.room_id);

                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between rounded-lg p-2 border border-slate-100 bg-slate-50/70 transition"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-slate-800 truncate">{cName}</div>
                            <div className="text-2xs text-slate-500">
                              {formatTime(s.start_time)} – {formatTime(s.end_time)} · Prof. {tName}
                              {rName ? ` · Aula ${rName}` : s.modality === "virtual" ? " · En línea" : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </div>
        </Card>
      </div>

      <SectionHeading>Mis cursos</SectionHeading>
      {current.length === 0 ? (
        <EmptyState
          icon={<IconBook className="h-5 w-5" />}
          title={
            history.length > 0
              ? "No tienes cursos en marcha"
              : "No estás matriculado en ningún curso"
          }
          message={
            history.length > 0
              ? "Tus cursos anteriores siguen abajo, con sus notas y certificados."
              : "Cuando dirección te matricule, tus cursos y tu progreso aparecerán aquí."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {current.map((e) => (
            <CourseCard
              key={e.id}
              enrollment={e}
              name={courseName(e.course_id)}
              stats={statsByCourse.get(e.course_id)}
              nextClass={nextClassForCourse(e.course_id)}
              gradesHidden={isOverdue}
              modality={modalityOf(e.course_id)}
              onSelect={() => setSelectedCourseForModal(e)}
            />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-6 group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-600 hover:text-slate-900">
            <span className="inline-flex items-center gap-1.5">
              <IconChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              Cursos anteriores ({history.length})
            </span>
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {history.map((e) => (
              <CourseCard
                key={e.id}
                enrollment={e}
                name={courseName(e.course_id)}
                stats={statsByCourse.get(e.course_id)}
                nextClass={null}
                gradesHidden={isOverdue}
                modality={modalityOf(e.course_id)}
                onSelect={() => setSelectedCourseForModal(e)}
              />
            ))}
          </div>
        </details>
      )}

      {/* Course Detail Modal */}
      {selectedCourseForModal && (() => {
        const en = selectedCourseForModal;
        const c = courses.find((co) => co.id === en.course_id);
        const lvl = levels.find((l) => l.id === c?.level_id);
        const courseAttendance = attendance.filter((a) => a.enrollment_id === en.id);
        const presentCount = courseAttendance.filter((a) => a.status === "present" || a.status === "late").length;
        const excusedCount = courseAttendance.filter((a) => a.status === "excused").length;
        const absentCount = courseAttendance.filter((a) => a.status === "absent").length;
        const totalCounted = presentCount + absentCount;
        const coursePct = totalCounted > 0 ? Math.round((presentCount / totalCounted) * 100) : 100;
        const courseGrades = grades.filter((g) => g.enrollment_id === en.id);
        const courseSchedules = schedules.filter((s) => s.course_id === en.course_id);
        const modalMod = modalityOf(en.course_id);

        return (
          <Modal
            title={c?.name ?? `Curso #${en.course_id}`}
            description={lvl ? `${lvl.code} — ${lvl.name}` : "Detalles académicos de tu curso"}
            onClose={() => setSelectedCourseForModal(null)}
            maxWidth="max-w-xl"
            footer={
              <ModalActions>
                <Link
                  to="/?m=tareas"
                  className="rounded-lg bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
                  onClick={() => setSelectedCourseForModal(null)}
                >
                  Ver tareas del curso →
                </Link>
                <Button variant="secondary" onClick={() => setSelectedCourseForModal(null)}>
                  Cerrar
                </Button>
              </ModalActions>
            }
          >
            <div className="space-y-5">
              {/* General Course Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block text-2xs uppercase font-medium">Código Matrícula</span>
                  <span className="font-mono font-semibold text-brand-700">{en.enrollment_code}</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block text-2xs uppercase font-medium">Modalidad</span>
                  <span className="font-semibold text-slate-800">
                    {modalMod ? courseModalityLabel(modalMod) : "Por definir"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                  <span className="text-slate-400 block text-2xs uppercase font-medium">Estado Matrícula</span>
                  <span className="font-semibold text-slate-800">
                    {ENROLLMENT_LABELS[en.status] ?? en.status}
                  </span>
                </div>
              </div>

              {/* Attendance Details Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-slate-900 text-sm">Resumen de Asistencia</span>
                  <span className="font-bold text-sm text-brand-700">{coursePct}% asistencia</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800 border border-emerald-100">
                    <div className="text-base font-bold">{presentCount}</div>
                    <div className="text-2xs text-emerald-600">Asistencias</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-800 border border-amber-100">
                    <div className="text-base font-bold">
                      {courseAttendance.filter((a) => a.status === "late").length}
                    </div>
                    <div className="text-2xs text-amber-600">Tardanzas</div>
                  </div>
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-800 border border-indigo-100">
                    <div className="text-base font-bold">{excusedCount}</div>
                    <div className="text-2xs text-indigo-600">Justificadas</div>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2 text-red-800 border border-red-100">
                    <div className="text-base font-bold">{absentCount}</div>
                    <div className="text-2xs text-red-600">Faltas</div>
                  </div>
                </div>
                <p className="mt-2 text-2xs text-slate-400 text-center">
                  * Las faltas justificadas no penalizan tu tasa de asistencia.
                </p>
              </div>

              {/* Schedules & Teachers */}
              <div>
                <span className="font-semibold text-slate-900 text-xs block mb-2">Horarios & Docentes</span>
                <div className="space-y-1.5">
                  {courseSchedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                    >
                      <span className="font-medium text-slate-800">
                        {DAYS[s.day_of_week]}: {formatTime(s.start_time)} – {formatTime(s.end_time)}
                      </span>
                      <span className="text-slate-500">
                        Prof. {teacherName(s.teacher_id)} {s.room_id ? `(Aula ${roomName(s.room_id)})` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evaluations & Grades */}
              {!isOverdue && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-900 text-xs">Evaluaciones del Curso</span>
                    <span className="text-2xs text-slate-500">Mínimo para aprobar: {c?.passing_score ?? 6.0}</span>
                  </div>
                  {courseGrades.length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg text-center border border-slate-100">
                      Aún no hay calificaciones registradas por el profesor.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {courseGrades.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                        >
                          <span className="text-slate-700">{g.evaluation_name}</span>
                          <span className="font-bold text-slate-900">{g.score} / 10</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {selectedMakeUp && (
        <MakeUpBookingModal
          credit={selectedMakeUp}
          onClose={() => setSelectedMakeUp(null)}
        />
      )}
    </div>
  );
}

/**
 * La cuota vencida, con su monto y su consecuencia — no "Oculto por pago
 * pendiente" sin más. El texto es el que ya arma `_student_items` en el
 * backend (`app/services/dashboard.py`): una sola fuente para la frase, en
 * vez de inventarla de nuevo aquí y arriesgar que las dos digan cosas
 * distintas.
 */
function DebtBanner() {
  const { data } = useDashboard();
  const item = data?.items.find((i) => i.kind === "payment_overdue");
  if (!item) return null;

  return (
    <div className="mb-5 flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <IconLock className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-900">
          {item.count === 1 ? "Tienes una cuota vencida" : `Tienes ${item.count} cuotas vencidas`}
          {item.amount != null && item.amount > 0 && (
            <span className="tabular"> · Q{item.amount.toFixed(2)}</span>
          )}
        </p>
        {item.detail && <p className="mt-1 text-xs text-amber-800">{item.detail}</p>}
      </div>
    </div>
  );
}

function NextClassHero({
  courseName,
  teacher,
  modality,
  room,
  start,
  opensAt,
  sessionId,
  tz,
  topic,
}: {
  courseName: string;
  teacher: string;
  modality: Modality;
  room: string | null;
  start: number;
  opensAt: number;
  sessionId: number;
  tz?: string;
  topic?: string | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lobbyOpen = now >= opensAt;
  const toStart = Math.max(0, start - now);
  const mins = Math.floor(toStart / 60000);
  const startIso = new Date(start).toISOString();

  const countLabel =
    toStart <= 0
      ? "En curso en vivo"
      : mins < 60
        ? `Empieza en ${mins} min`
        : `Empieza ${formatDateTime(startIso, tz)}`;

  return (
    // El alumno no opera esta clase, sólo la espera: el mismo negro casi puro
    // que usa el profesor para "estoy dando esta clase ahora" aquí se leería
    // como una urgencia que no existe. Un gradiente en el verde institucional
    // mantiene la prioridad visual sin pedirle al alumno que se ponga alerta.
    <div className="flex h-full flex-col rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-200">
          {countLabel}
        </div>
        {topic && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-brand-100 border border-white/15">
            Tema: {topic}
          </span>
        )}
      </div>

      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{courseName}</h2>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-brand-100">
        <span className="tabular">
          {formatDateTime(startIso, tz)}
          {tz && ` (${timeZoneLabel(startIso, tz)})`}
        </span>
        <span aria-hidden="true">·</span>
        <span>Prof. {teacher}</span>
        <span aria-hidden="true">·</span>
        <span>{locationSummary(modality, room)}</span>
      </div>

      <div className="mt-auto pt-6">
        {/* Una presencial no se "abre": el alumno va al aula. Ofrecerle un
            botón de entrar en vivo y una cuenta atrás le dice que espere
            delante de la pantalla una clase que ocurre en el centro. */}
        {modality === "presencial" ? (
          <span className="inline-flex items-center gap-2 text-sm text-brand-100">
            <IconPin className="h-4 w-4 text-brand-300" />
            {room ? `Te esperamos en ${room}` : "Aula por asignar"}
          </span>
        ) : lobbyOpen ? (
          <Link
            to={`/lobby/${sessionId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 transition-all shadow-lg shadow-black/10 hover:bg-brand-50 hover:scale-105"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
            Entrar a la clase en vivo
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-brand-100">
            <IconClock className="h-4 w-4 text-brand-300" />
            El acceso al aula virtual se abre {LOBBY_WINDOW_MIN} min antes del inicio
          </span>
        )}
      </div>
    </div>
  );
}

// Circular progress ring (attendance).
function Ring({ pct, tone }: { pct: number; tone: "green" | "amber" }) {
  const color = tone === "green" ? "#0F6E62" : "#B77A2B";
  return (
    <div
      className="relative h-14 w-14 flex-none"
      role="img"
      aria-label={`Asistencia: ${pct}%`}
    >
      <div
        className="h-14 w-14 rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${pct}%, #EFEADD ${pct}% 100%)` }}
      />
      <div className="tabular absolute inset-[6px] flex items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
        {pct}%
      </div>
    </div>
  );
}

function CourseCard({
  enrollment,
  name,
  stats,
  nextClass,
  gradesHidden,
  modality,
  onSelect,
}: {
  enrollment: Enrollment;
  name: string;
  stats?: { attendancePct: number | null; average: number | null };
  nextClass: string | null;
  /** Unpaid fees: the grades were never fetched, so say so rather than "—". */
  gradesHidden: boolean;
  /** Deducida de las franjas del curso; `null` si todavía no tiene ninguna. */
  modality: Modality | "mixta" | null;
  onSelect?: () => void;
}) {
  const payColor =
    enrollment.payment_status === "paid"
      ? "green"
      : enrollment.payment_status === "overdue"
        ? "red"
        : "amber";
  const pct = stats?.attendancePct ?? null;
  const avg = stats?.average ?? null;
  const tone: "green" | "amber" = pct != null && pct >= 75 ? "green" : "amber";

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="block truncate text-base font-semibold text-slate-900">
            {name}
          </span>
          {/* Cómo se imparte el curso. La tarjeta no lo decía en ninguna parte:
              el alumno sólo se enteraba de si su clase era presencial o en línea
              al llegar la próxima sesión a la portada. */}
          {modality && (
            <span className="mt-0.5 block text-2xs text-slate-500">
              {courseModalityLabel(modality)}
            </span>
          )}
        </div>
        <Badge color={enrollment.status === "active" ? "green" : "slate"}>
          {ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status}
        </Badge>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-none flex-col items-center gap-1">
          {pct != null ? (
            <Ring pct={pct} tone={tone} />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
              —
            </div>
          )}
          {/* El anillo necesitaba etiqueta: antes la única palabra
              "Asistencia" estaba pegada a la insignia de pago, describiendo
              un dato que no era el suyo. */}
          <span className="text-2xs font-medium text-slate-500">Asistencia</span>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Promedio</span>
              <span className="tabular font-semibold text-slate-900">
                {gradesHidden ? "—" : (avg ?? "—")}
                <span className="font-normal text-slate-400">/10</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${!gradesHidden && avg != null ? (avg / 10) * 100 : 0}%`,
                  background: tone === "green" ? "#0F6E62" : "#B77A2B",
                }}
              />
            </div>
            {/* "Oculto por pago pendiente" no decía cuánto ni por qué curso: el
                alumno iba a preguntarle al profesor algo que sólo
                administración resuelve. La deuda es del alumno, no del curso
                — una matrícula al día puede tener las notas ocultas por otra
                que no lo está — así que se nombra la causa real de cada caso. */}
            {gradesHidden && (
              <p className="tabular mt-1 text-2xs font-medium text-amber-800">
                {enrollment.payment_status === "overdue" && enrollment.balance > 0
                  ? `Debe Q${enrollment.balance.toFixed(2)} · notas ocultas`
                  : "Notas ocultas por una cuota vencida en otro curso"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Pago</span>
            <Badge color={payColor}>
              {PAYMENT_LABELS[enrollment.payment_status] ?? enrollment.payment_status}
            </Badge>
          </div>
        </div>
      </div>

      {nextClass && (
        <div className="mt-3 text-xs text-slate-500">Próxima clase: {nextClass}</div>
      )}
      {!gradesHidden && <FinalGradeRow enrollmentId={enrollment.id} />}

      {onSelect && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onSelect}
            className="text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline transition"
          >
            Ver expediente del curso →
          </button>
        </div>
      )}
    </Card>
  );
}

function FinalGradeRow({ enrollmentId }: { enrollmentId: number }) {
  const { data: final } = useFinalGrade(enrollmentId);

  if (!final || final.final_score == null) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
      <span className="text-slate-500">
        Nota final:{" "}
        <strong className={final.passed ? "text-green-700" : "text-red-600"}>
          {final.final_score}
        </strong>{" "}
        / {final.passing_score}
      </span>
      <Badge color={final.passed ? "green" : "red"}>
        {final.passed ? "Aprobado" : "No aprobado"}
      </Badge>
    </div>
  );
}
