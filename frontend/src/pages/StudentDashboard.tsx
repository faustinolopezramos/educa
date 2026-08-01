import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import {
  Badge, Button, Card, EmptyState, PageHeader, SectionHeading, SegmentedControl,
  SkeletonRows,
} from "../components/ui";
import { ActionTray } from "../components/ActionTray";
import {
  IconBook, IconChevronRight, IconClock, IconLock,
} from "../components/icons";
import { StudentGrades } from "../features/grades/StudentGrades";
import { AssignmentsPanel } from "../features/assignments/AssignmentsPanel";
import { ProfilePanel } from "../features/profile/ProfilePanel";
import { ReportView } from "../features/reports/ReportView";
import {
  DAYS,
  ENROLLMENT_LABELS,
  PAYMENT_LABELS,
  formatDateTime,
  formatTime,
  timeZoneLabel,
} from "../lib/format";
import { isCurrentEnrollment } from "../lib/enrollment";
import {
  downloadCertificatePdf,
  useCourses,
  useEnrollmentCertificate,
  useEnrollments,
  useFinalGrade,
  useGrades,
  useMySessions,
  usePublicTeachers,
  useRooms,
  useSchedules,
  useVisibleAttendance,
} from "../lib/queries";
import { LOBBY_WINDOW_MIN, GRACE_MS } from "../lib/constants";
import { notify } from "../lib/toast";
import type { Enrollment } from "../lib/types";

function sessionStartMs(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

/** Today as Monday=0..Sunday=6, the convention `Schedule.day_of_week` uses. */
function localDow(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}

export default function StudentDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";
  const { data: enrollments = [] } = useEnrollments();
  const isOverdue = useMemo(
    () => enrollments.some((e) => e.status === "active" && e.payment_status === "overdue"),
    [enrollments],
  );

  if (section === "tareas") return <AssignmentsPanel />;
  // "Calificaciones" and "Reporte" were two menu entries answering the same
  // question — how am I doing — and a student had to know which one held the
  // number they wanted. They are one section with two views now.
  if (section === "progreso" || section === "calificaciones" || section === "reportes") {
    return <ProgressView isOverdue={isOverdue} initial={section} />;
  }
  if (section === "perfil") return <ProfilePanel />;
  return <WeekView />;
}

function ProgressView({
  isOverdue,
  initial,
}: {
  isOverdue: boolean;
  /** Honours the two old section ids, so a bookmark still lands where it used to. */
  initial: string;
}) {
  const [view, setView] = useState<"notas" | "avance">(
    initial === "reportes" ? "avance" : "notas",
  );

  return (
    <div>
      <PageHeader
        title="Mi progreso"
        description="Tus notas por curso y tu avance del periodo."
      />
      <div className="mb-4">
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "notas", label: "Notas" },
            { value: "avance", label: "Avance del periodo" },
          ]}
        />
      </div>
      {isOverdue ? (
        <PaymentGate what={view === "notas" ? "tus notas" : "tu avance"} />
      ) : view === "notas" ? (
        <StudentGrades />
      ) : (
        <StudentReport />
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
  const overdue = enrollments.filter(
    (e) => e.status === "active" && e.payment_status === "overdue",
  );

  if (isLoading) return <SkeletonRows rows={4} />;
  if (overdue.length > 0) return <PaymentGate what="tu reporte" />;

  return <ReportView />;
}

function WeekView() {
  const { user } = useAuth();
  const tz = user?.timezone;
  const { data: enrollments = [] } = useEnrollments();
  const { data: courses = [] } = useCourses();
  const { data: schedules = [] } = useSchedules();
  const { data: sessions = [] } = useMySessions();
  const { data: teachers = [] } = usePublicTeachers();
  const { data: rooms = [] } = useRooms();
  const { data: attendance = [] } = useVisibleAttendance();
  const { data: grades = [] } = useGrades();

  const now = Date.now();
  const todayDow = localDow();

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? "—";
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);

  // Courses the student is still in, versus ones they finished or left. The two
  // used to be one undifferentiated list, so a course dropped two terms ago sat
  // beside Tuesday's class with the same weight and the same progress ring.
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
    const att = attendance.filter((a) => a.enrollment_id === e.id);
    const attended = att.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const attendancePct = att.length ? Math.round((attended / att.length) * 100) : null;
    const gr = grades.filter((g) => g.enrollment_id === e.id);
    const average = gr.length
      ? Math.round((gr.reduce((s, g) => s + g.score, 0) / gr.length) * 10) / 10
      : null;
    statsByCourse.set(e.course_id, { attendancePct, average });
  }

  const nextClassForCourse = (courseId: number): string | null => {
    const n = myMeetings.find((x) => x.sched.course_id === courseId);
    return n ? formatDateTime(new Date(n.start).toISOString(), tz) : null;
  };

  return (
    <div>
      <PageHeader title={`Hola, ${user?.full_name?.split(" ")[0] ?? ""}`} />

      {/* Overdue fees and unhandled homework arrive here, with the amount and
          the deadline. This replaced a bare "tienes un pago vencido" that never
          said how much, and homework that was only discoverable by navigating
          to the Tareas section and counting. */}
      <ActionTray
        title="Pendientes"
        emptyMessage="No tienes pendientes. Todo al día."
      />

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

        <Card>
          <SectionHeading>Esta semana</SectionHeading>
          {/* All seven days. This used to stop at Friday, so a student on the
              Plan Sabatino or Dominical — jornadas the academy actually sells —
              opened their week and found it empty. */}
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => {
              const dayClasses = mySchedules.filter((s) => s.day_of_week === i);
              const has = dayClasses.length > 0;
              const isToday = i === todayDow;
              return (
                <div key={i} className="flex-1 text-center">
                  <div
                    className={`text-2xs font-medium ${
                      isToday ? "text-brand-700" : "text-slate-400"
                    }`}
                  >
                    {d.slice(0, 2)}
                  </div>
                  <div
                    title={
                      has
                        ? `${d}: ${dayClasses
                            .map((s) => `${courseName(s.course_id)} ${formatTime(s.start_time)}`)
                            .join(", ")}`
                        : `${d}: sin clase`
                    }
                    className={`mt-1 h-7 rounded-md ${
                      has ? "bg-brand-600" : "bg-slate-100"
                    } ${isToday ? "ring-2 ring-brand-300 ring-offset-1" : ""}`}
                  />
                </div>
              );
            })}
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
            />
          ))}
        </div>
      )}

      {/* Finished and abandoned courses keep their grades and certificates, so
          they are worth keeping — just not mixed in with the live ones. */}
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
              />
            ))}
          </div>
        </details>
      )}
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
}: {
  courseName: string;
  teacher: string;
  modality: string;
  room: string | null;
  start: number;
  opensAt: number;
  sessionId: number;
  tz?: string;
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
    <div className="flex h-full flex-col rounded-xl bg-slate-900 p-6 text-slate-100">
      <div className="text-xs font-semibold uppercase tracking-wider text-brand-300">
        {countLabel}
      </div>

      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{courseName}</h2>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
        <span className="tabular">
          {formatDateTime(startIso, tz)}
          {tz && ` (${timeZoneLabel(startIso, tz)})`}
        </span>
        <span aria-hidden="true">·</span>
        <span>Prof. {teacher}</span>
        <span aria-hidden="true">·</span>
        <span>{modality === "virtual" ? "Aula virtual" : room ? `Aula ${room}` : "Presencial"}</span>
      </div>

      <div className="mt-auto pt-6">
        {lobbyOpen ? (
          <Link
            to={`/lobby/${sessionId}`}
            className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
          >
            Entrar a la clase
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-slate-400">
            <IconClock className="h-4 w-4" />
            El acceso se abre {LOBBY_WINDOW_MIN} min antes
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
}: {
  enrollment: Enrollment;
  name: string;
  stats?: { attendancePct: number | null; average: number | null };
  nextClass: string | null;
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
        <span className="min-w-0 truncate text-base font-semibold text-slate-900">{name}</span>
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
                {avg ?? "—"}
                <span className="font-normal text-slate-400">/10</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${avg != null ? (avg / 10) * 100 : 0}%`,
                  background: tone === "green" ? "#0F6E62" : "#B77A2B",
                }}
              />
            </div>
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
      <FinalGradeRow enrollmentId={enrollment.id} />
    </Card>
  );
}

function FinalGradeRow({ enrollmentId }: { enrollmentId: number }) {
  const { data: final } = useFinalGrade(enrollmentId);
  const { data: certificate } = useEnrollmentCertificate(enrollmentId);

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
      {certificate && (
        <Button
          size="sm"
          onClick={() =>
            downloadCertificatePdf(certificate.id, certificate.code).catch(() =>
              notify("No se pudo descargar el certificado", "error"),
            )
          }
        >
          Descargar certificado
        </Button>
      )}
    </div>
  );
}
