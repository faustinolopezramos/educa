import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Badge, Button, Card, EmptyState, PageTitle, SectionHeading } from "../components/ui";
import { StudentGrades } from "../features/grades/StudentGrades";
import { ReportView } from "../features/reports/ReportView";
import {
  DAYS,
  ENROLLMENT_LABELS,
  PAYMENT_LABELS,
  formatDateTime,
  timeZoneLabel,
} from "../lib/format";
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
import { notify } from "../lib/toast";
import type { Enrollment } from "../lib/types";

const LOBBY_WINDOW_MIN = 15;
const GRACE_MS = 2 * 60 * 60_000;

function sessionStartMs(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

export default function StudentDashboard() {
  const [params] = useSearchParams();
  const section = params.get("m") ?? "inicio";
  const { data: enrollments = [] } = useEnrollments();
  const isOverdue = useMemo(
    () => enrollments.some((e) => e.status === "active" && e.payment_status === "overdue"),
    [enrollments],
  );

  if (section === "calificaciones") {
    if (isOverdue) {
      return (
        <div>
          <PageTitle subtitle="Mi progreso">Mis calificaciones</PageTitle>
          <Card>
            <EmptyState
              icon="◔"
              title="Regulariza tu pago para ver tus notas"
              message="Tus calificaciones estarán disponibles en cuanto tu cuota esté al día. Si ya pagaste, avisa a administración para que actualicen tu estado."
            />
          </Card>
        </div>
      );
    }
    return (
      <div>
        <PageTitle subtitle="Mi progreso">Mis calificaciones</PageTitle>
        <StudentGrades />
      </div>
    );
  }
  if (section === "reportes") {
    return (
      <div>
        <PageTitle subtitle="Mi progreso">Mi reporte</PageTitle>
        <StudentReport />
      </div>
    );
  }
  return <WeekView />;
}

// The progress report is only shown to students who are up to date on payments.
function StudentReport() {
  const { data: enrollments = [], isLoading } = useEnrollments();
  const overdue = enrollments.filter(
    (e) => e.status === "active" && e.payment_status === "overdue",
  );

  if (isLoading) return <p className="text-slate-500">Cargando…</p>;

  if (overdue.length > 0) {
    return (
      <Card>
        <EmptyState
          icon="◔"
          title="Regulariza tu pago para ver tu reporte"
          message="Tu reporte de avance estará disponible en cuanto tu cuota esté al día. Si ya pagaste, avisa a administración para que actualicen tu estado."
          action={
            <Button variant="danger" className="text-xs">
              Regularizar pago
            </Button>
          }
        />
      </Card>
    );
  }

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

  const courseName = (id: number) => courses.find((c) => c.id === id)?.name ?? `#${id}`;
  const teacherName = (id: number) =>
    teachers.find((t) => t.id === id)?.full_name ?? "—";
  const roomName = (id: number | null) =>
    id == null ? null : (rooms.find((r) => r.id === id)?.name ?? null);

  const myCourseIds = new Set(enrollments.map((e) => e.course_id));
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

  const overdue = enrollments.find((e) => e.payment_status === "overdue");

  return (
    <div>
      <PageTitle subtitle={`Hola, ${user?.full_name?.split(" ")[0] ?? ""}`}>
        Tu semana
      </PageTitle>

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        {/* Hero: next class */}
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
                icon="◷"
                title="No tienes clases programadas"
                message="Cuando tengas una clase próxima, aparecerá aquí con acceso directo al Lobby."
              />
            </Card>
          )}
        </div>

        {/* Side: payment nudge + weekly strip */}
        <div className="space-y-5">
          {overdue && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                Pago vencido
              </div>
              <p className="mt-1.5 text-sm text-red-700/90">
                Tu cuota de {courseName(overdue.course_id)} está vencida.
              </p>
              <Button variant="danger" className="mt-3 text-xs">
                Regularizar pago
              </Button>
            </div>
          )}
          <Card>
            <SectionHeading>Esta semana</SectionHeading>
            <div className="flex gap-1.5">
              {DAYS.slice(0, 5).map((d, i) => {
                const has = mySchedules.some((s) => s.day_of_week === i);
                return (
                  <div key={i} className="flex-1 text-center">
                    <div className="font-mono text-[10px] text-slate-400">{d[0]}</div>
                    <div
                      className={`mt-1 h-7 rounded-md ${
                        has ? "bg-brand-600" : "bg-slate-100"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <SectionHeading>Mis cursos</SectionHeading>
      {enrollments.length === 0 ? (
        <EmptyState
          icon="◈"
          title="No estás matriculado en ningún curso"
          message="Cuando dirección te matricule, tus cursos y tu progreso aparecerán aquí."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enrollments.map((e) => (
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
      ? "En curso"
      : mins < 60
        ? `Empieza en ${mins} min`
        : `Empieza ${formatDateTime(startIso, tz)}`;

  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-slate-900 p-7 text-slate-50">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-50"
        style={{ background: "radial-gradient(circle,#0F6E62,transparent 70%)" }}
      />
      <div className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-100" />
        {countLabel}
      </div>
      <h3 className="mt-4 font-serif text-3xl font-medium">{courseName}</h3>
      <div className="mt-1 text-sm text-slate-400">
        {formatDateTime(startIso, tz)}
        {tz && ` (${timeZoneLabel(startIso, tz)})`} · con {teacher} ·{" "}
        {modality === "virtual" ? "Virtual" : room ? room : "Presencial"}
      </div>
      <div className="mt-6">
        {lobbyOpen ? (
          <Link
            to={`/lobby/${sessionId}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Entrar al Lobby →
          </Link>
        ) : (
          <span className="inline-flex items-center rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-400">
            El Lobby abre 15 min antes
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
    <div className="relative h-16 w-16 flex-none">
      <div
        className="h-16 w-16 rounded-full"
        style={{
          background: `conic-gradient(${color} 0 ${pct}%, #EFEADD ${pct}% 100%)`,
        }}
      />
      <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white font-mono text-sm font-bold text-slate-800">
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
        <span className="font-serif text-lg font-medium text-slate-900">{name}</span>
        <Badge color={enrollment.status === "active" ? "green" : "slate"}>
          {ENROLLMENT_LABELS[enrollment.status] ?? enrollment.status}
        </Badge>
      </div>

      <div className="flex items-center gap-5">
        {pct != null ? (
          <Ring pct={pct} tone={tone} />
        ) : (
          <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-slate-100 font-mono text-xs text-slate-400">
            —
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Promedio</span>
              <span className="font-mono font-bold text-slate-800">
                {avg ?? "—"}
                <span className="text-slate-400">/10</span>
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
          <div className="text-xs font-medium text-slate-500">
            Asistencia · Pago:{" "}
            <Badge color={payColor}>
              {PAYMENT_LABELS[enrollment.payment_status] ?? enrollment.payment_status}
            </Badge>
          </div>
        </div>
      </div>

      {nextClass && (
        <div className="mt-3 text-xs text-slate-400">Próxima clase: {nextClass}</div>
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
        <button
          onClick={() =>
            downloadCertificatePdf(certificate.id, certificate.code).catch(() =>
              notify("No se pudo descargar el certificado", "error"),
            )
          }
          className="rounded-lg bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700"
        >
          Descargar certificado
        </button>
      )}
    </div>
  );
}
