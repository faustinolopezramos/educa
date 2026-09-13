import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Badge, Button, Card, Input, PageTitle } from "../components/ui";
import { apiErrorMessage } from "../lib/api";
import {
  formatDateTime,
  formatTime,
  modalityColor,
  modalityLabel,
  needsLink,
} from "../lib/format";
import {
  useEnrollments,
  useLobbyJoinInfo,
  useRooms,
  useSchedules,
  useSession,
  useUpdateSession,
} from "../lib/queries";
import { notify } from "../lib/toast";
import type { ClassSession, Schedule } from "../lib/types";

type AvStatus = "idle" | "ok" | "error";

function sessionStart(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

export default function Lobby() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const { user } = useAuth();
  const { data: session, isLoading, isError } = useSession(id);
  const { data: lobbyInfo } = useLobbyJoinInfo(id);
  const { data: schedules = [] } = useSchedules();
  const { data: enrollments = [] } = useEnrollments();
  const schedule = schedules.find((s) => s.id === session?.schedule_id);

  const isStudentBlocked =
    !!user &&
    user.role === "student" &&
    !!schedule &&
    enrollments.some(
      (e) =>
        e.course_id === schedule.course_id &&
        e.attendance_blocked,
    );

  const [remaining, setRemaining] = useState<number>(0);
  const [av, setAv] = useState<AvStatus>("idle");

  useEffect(() => {
    if (!session || !schedule) return;
    const start = sessionStart(session.date, schedule.start_time);
    const update = () => setRemaining(Math.max(0, start - Date.now()));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [session, schedule]);

  if (isLoading)
    return <p className="text-slate-500">Cargando lobby…</p>;
  if (isError || !session)
    return (
      <div>
        <p className="text-red-600">No se pudo cargar la clase.</p>
        <Link to="/" className="text-brand-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );

  if (isStudentBlocked) {
    return (
      <div>
        <PageTitle subtitle="Aula virtual">Lobby</PageTitle>
        <Card>
          <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">
              Tu acceso a clases está restringido
            </p>
            <p className="mt-2 text-sm text-red-600/90">
              Contacta a administración para regularizar tu situación.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block text-sm text-brand-600 hover:underline"
            >
              ← Volver al inicio
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Quién abre la sala en vez de esperar en ella. Tiene que decir lo mismo que
  // `meetings.py:get_session_lobby_info`, que concede anfitrión al profesor
  // titular de la franja **y a dirección**: preguntando sólo por el titular,
  // un admin recibía del servidor su `host_url` y la interfaz le ponía delante
  // la pantalla de espera del alumno, sin forma de entrar.
  const isHost =
    !!user &&
    (user.role === "admin" ||
      user.role === "superadmin" ||
      (!!schedule && schedule.teacher_id === user.id));
  const isSavedAvOk = typeof window !== "undefined" && sessionStorage.getItem("educa_av_ok") === "true";
  const avReady = av === "ok" || isSavedAvOk;

  // Una clase presencial no tiene lobby, porque no hay adónde entrar. Poner una
  // prueba de cámara y una cuenta regresiva para "entrar a la clase en vivo"
  // delante de alguien que tiene que cruzar la ciudad hasta un aula no es una
  // pantalla neutra: es una instrucción equivocada.
  if (schedule && schedule.modality === "presencial") {
    return <InPersonClass session={session} schedule={schedule} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle subtitle={isHost ? "Eres el anfitrión" : "Aula virtual"}>
          {isHost ? "Sala de clase" : "Lobby de Entrada"}
        </PageTitle>
        <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1">
          ← Volver a mis clases
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MediaTest onStatus={setAv} />

        {isHost ? (
          <HostPanel
            session={session}
            schedule={schedule}
            remaining={remaining}
            avReady={avReady}
            lobbyInfo={lobbyInfo}
          />
        ) : (
          <StudentPanel session={session} schedule={schedule} remaining={remaining} avReady={avReady} lobbyInfo={lobbyInfo} />
        )}
      </div>
    </div>
  );
}

import type { LobbyJoinInfo } from "../lib/types";

/**
 * Lo que ve quien tiene una clase **presencial**.
 *
 * Ni prueba de dispositivos ni botón de entrar: la información útil es dónde y
 * a qué hora. El lobby completo se reserva para virtual y semi presencial, que
 * son las modalidades donde efectivamente hay una sala que abrir.
 */
function InPersonClass({
  session,
  schedule,
}: {
  session: ClassSession;
  schedule: Schedule;
}) {
  const { data: rooms = [] } = useRooms();
  const room = rooms.find((r) => r.id === schedule.room_id);
  const startIso = new Date(
    sessionStart(session.date, schedule.start_time),
  ).toISOString();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle subtitle="Clase presencial">Tu clase de hoy</PageTitle>
        <Link
          to="/"
          className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline"
        >
          ← Volver a mis clases
        </Link>
      </div>

      <Card className="max-w-xl">
        <div className="text-sm text-slate-500">
          {formatDateTime(startIso)} · {formatTime(schedule.start_time)}–
          {formatTime(schedule.end_time)}
        </div>

        <div className="my-5">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Dónde
          </div>
          <div className="mt-1 font-serif text-3xl font-medium text-slate-900">
            {room?.name ?? "Aula por asignar"}
          </div>
          {room?.capacity != null && (
            <div className="mt-1 text-sm text-slate-500">
              Capacidad {room.capacity}
            </div>
          )}
        </div>

        {!room && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Dirección todavía no ha asignado el aula. Consulta con recepción
            antes de la clase.
          </p>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Esta clase se imparte en el centro. No necesitas conectarte a nada.
        </p>
      </Card>
    </div>
  );
}

// The host (teacher) opens the room and starts the class — enabled early so they
// The host (teacher) opens the room and starts the class — enabled early so they
// can prep, and it records the session as held plus the day's topic.
function HostPanel({
  session,
  schedule,
  remaining,
  avReady,
  lobbyInfo,
}: {
  session: ClassSession;
  schedule: Schedule | undefined;
  remaining: number;
  avReady: boolean;
  lobbyInfo?: LobbyJoinInfo;
}) {
  const update = useUpdateSession();
  const [topic, setTopic] = useState(session.topic ?? "");
  const [started, setStarted] = useState(session.status === "held");

  const startIso = schedule
    ? new Date(sessionStart(session.date, schedule.start_time)).toISOString()
    : session.date;
  const wantsLink = schedule ? needsLink(schedule.modality) : false;
  const joinUrl =
    lobbyInfo?.host_url ??
    lobbyInfo?.join_url ??
    (wantsLink ? (schedule?.join_url ?? null) : null);
  const missingLink = wantsLink && !joinUrl;
  const overdue = remaining <= 0;
  const isGracePeriod = lobbyInfo?.reason?.includes("gracia") ?? false;

  if (session.status === "cancelled") {
    return (
      <Card>
        <div className="text-sm text-slate-500">
          Tu clase · inicio {formatDateTime(startIso)}
        </div>
        <div className="my-5 font-serif text-2xl font-medium text-slate-700">
          Esta clase está cancelada
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
          {session.cancel_reason
            ? `Motivo: ${session.cancel_reason}`
            : "No hace falta que abras la sala."}
        </p>
      </Card>
    );
  }

  function openRoom() {
    if (joinUrl) window.open(joinUrl, "_blank", "noopener,noreferrer");
  }

  function start() {
    openRoom();
    update.mutate(
      { id: session.id, status: "held", topic: topic.trim() || null },
      {
        onSuccess: () => {
          setStarted(true);
          notify("Clase iniciada", "success");
        },
        onError: (e) =>
          notify(apiErrorMessage(e, "No se pudo iniciar la clase"), "error"),
      },
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-slate-500">
          Tu clase · inicio {formatDateTime(startIso)}
        </div>
        {schedule && (
          <Badge color={modalityColor(schedule.modality)}>
            {modalityLabel(schedule.modality)}
          </Badge>
        )}
      </div>

      <div className="my-5">
        {isGracePeriod ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 font-serif text-lg font-bold text-amber-900">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              Período de Gracia Post-Clase (15 min)
            </div>
            <p className="mt-1 text-xs text-amber-800">
              La hora lectiva ha concluido, pero la sala permanece abierta para atenciones finales o consultas.
            </p>
          </div>
        ) : started ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-serif text-xl font-bold text-emerald-800">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              La clase está en curso
            </div>
            <p className="mt-1 text-xs text-emerald-700">
              Los alumnos ya pueden conectarse a la sala virtual.
            </p>
          </div>
        ) : overdue ? (
          <div className="font-serif text-2xl font-medium text-slate-900">
            Es la hora de empezar
          </div>
        ) : (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Empieza en
            </div>
            <Countdown ms={remaining} />
          </>
        )}
      </div>

      {started || isGracePeriod ? (
        <>
          <ul className="mb-5 space-y-2.5">
            <CheckItem done label="Sesión marcada como dada" />
            <CheckItem done={!!topic.trim()} label={topic.trim() ? `Tema: ${topic.trim()}` : "Sin tema anotado"} pending />
          </ul>
          {joinUrl && (
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl shadow-sm transition" onClick={openRoom}>
              {isGracePeriod ? "Acceder a Sala de Consulta (Gracia) →" : "Volver a abrir la sala →"}
            </Button>
          )}
          <Link
            to="/"
            className="mt-2 block w-full rounded-xl bg-slate-100 px-3 py-3 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-200"
          >
            Pasar lista y calificar →
          </Link>
        </>
      ) : (
        <>
          <label className="mb-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Tema de hoy (opcional)
            </span>
            <Input
              placeholder="Ej. Pretérito vs. imperfecto"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </label>

          <ul className="mb-5 space-y-2.5">
            <CheckItem done={avReady} label="Cámara detectada" pending />
            <CheckItem done={avReady} label="Micrófono con señal" pending />
            <CheckItem done label="Eres el anfitrión de la sala" />
          </ul>

          {missingLink ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-700">
              Esta clase virtual aún no tiene enlace.{" "}
              <Link to="/" className="font-semibold underline">
                Publícalo en «Mis clases»
              </Link>{" "}
              para poder abrir la sala.
            </div>
          ) : (
            <>
              <Button
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl shadow-md transition"
                disabled={update.isPending}
                onClick={start}
              >
                {update.isPending ? "Iniciando…" : "Iniciar la clase →"}
              </Button>
              <p className="mt-2 text-center text-xs text-slate-400">
                {schedule?.modality === "semi_presencial"
                  ? "Abre la sala para quien se conecta y recibe en el aula a quien viene."
                  : wantsLink
                    ? "Abre la sala en una pestaña nueva y avisa que la clase empezó."
                    : "Marca la sesión como dada; recibe a tus alumnos en el aula."}
                {!avReady && " Prueba antes tu cámara y micrófono."}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// The student's waiting view: prep A/V and enter once the host opens the room.
function StudentPanel({
  session,
  schedule,
  remaining,
  avReady,
  lobbyInfo,
}: {
  session: ClassSession;
  schedule: Schedule | undefined;
  remaining: number;
  avReady: boolean;
  lobbyInfo?: LobbyJoinInfo;
}) {
  const startIso = schedule
    ? new Date(sessionStart(session.date, schedule.start_time)).toISOString()
    : session.date;
  const joinUrl = lobbyInfo?.join_url ?? null;
  const canJoin = lobbyInfo?.can_join ?? false;
  const isGracePeriod = lobbyInfo?.reason?.includes("gracia") ?? false;

  return (
    <Card>
      <div className="text-sm text-slate-500">Tu clase · inicio {formatDateTime(startIso)}</div>

      {session.topic && (
        <div className="mt-2.5 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-900">
          <span className="font-semibold text-brand-700">Tema de hoy: </span>
          <span className="font-medium">{session.topic}</span>
        </div>
      )}

      {session.status === "cancelled" && (
        <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <span className="font-semibold block">Esta clase fue cancelada.</span>
          {session.cancel_reason && <p className="mt-0.5">{session.cancel_reason}</p>}
        </div>
      )}

      <div className="my-5">
        {isGracePeriod ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 font-serif text-lg font-bold text-amber-900">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              Período de Gracia Post-Clase (15 min)
            </div>
            <p className="mt-1 text-xs text-amber-800">
              La clase finalizó, pero el enlace sigue activo para consultas o descarga de material.
            </p>
          </div>
        ) : canJoin ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-serif text-xl font-bold text-emerald-800">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              La sala está abierta
            </div>
            <p className="mt-1 text-xs text-emerald-700">
              ¡El profesor ha abierto el aula virtual! Puedes ingresar ahora.
            </p>
          </div>
        ) : remaining > 0 ? (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Empieza en
            </div>
            <Countdown ms={remaining} />
            <p className="mt-2 text-xs text-slate-500">
              El enlace se habilitará 15 minutos antes de la hora de inicio.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-serif text-xl font-bold text-slate-700">
              Clase Concluida
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Esta clase ya terminó y su período de gracia de 15 minutos ha expirado.
            </p>
          </div>
        )}
      </div>

      {/* Checklist "listo para entrar" */}
      <ul className="mb-5 space-y-2.5">
        <CheckItem done={avReady} label="Cámara detectada" />
        <CheckItem done={avReady} label="Micrófono con señal" />
        <CheckItem
          done={canJoin}
          label={
            isGracePeriod
              ? "Enlace extendido activo (15 min gracia)"
              : canJoin
                ? "La sala está abierta"
                : "El profesor abrirá la sala 15 min antes"
          }
          pending
        />
      </ul>

      {session.recording_url && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="font-bold text-indigo-900 text-sm">📹 Grabación de la Clase Disponible</p>
          <p className="mt-1 text-xs text-indigo-700">Esta clase cuenta con video grabado para repaso.</p>
          <a
            href={session.recording_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
          >
            ▶ Ver Grabación de la Clase
          </a>
        </div>
      )}

      {joinUrl ? (
        <a
          href={canJoin && avReady ? joinUrl : undefined}
          target="_blank"
          rel="noreferrer"
          className={`block w-full rounded-xl px-4 py-3.5 text-center text-sm font-bold shadow-md transition ${
            canJoin && avReady
              ? isGracePeriod
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
              : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
          }`}
          onClick={(e) => {
            if (!(canJoin && avReady)) e.preventDefault();
          }}
        >
          {!avReady
            ? "Prueba tu cámara y micrófono primero"
            : isGracePeriod
              ? "Entrar a Sala de Consulta (Período Gracia) →"
              : canJoin
                ? "Entrar a la Clase Virtual →"
                : "Disponible 15 min antes del inicio"}
        </a>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
          El profesor aún no ha publicado el enlace de la clase.
        </p>
      )}
      <p className="mt-2 text-center text-xs text-slate-400">
        Se abrirá Zoom / Meet / Teams en una pestaña nueva.
      </p>
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-slate-500">¿Tienes tareas pendientes?</span>
        <Link to="/?m=tareas" className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
          Ver Tareas →
        </Link>
      </div>
    </Card>
  );
}

function CheckItem({
  done,
  label,
  pending = false,
}: {
  done: boolean;
  label: string;
  pending?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
          done
            ? "bg-brand-600 text-white"
            : pending
              ? "border border-slate-300 text-slate-400"
              : "border border-slate-300 text-slate-400"
        }`}
      >
        {done ? "✓" : "•"}
      </span>
      <span className={done ? "text-slate-700" : "text-slate-500"}>{label}</span>
    </li>
  );
}

function Countdown({ ms }: { ms: number }) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="mt-1 font-mono text-4xl font-bold text-slate-900">
      {h > 0 && `${pad(h)}:`}
      {pad(m)}:{pad(s)}
    </div>
  );
}

// Camera + microphone check using the Web MediaDevices API.
function MediaTest({ onStatus }: { onStatus?: (s: AvStatus) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<AvStatus>(() => {
    return typeof window !== "undefined" && sessionStorage.getItem("educa_av_ok") === "true"
      ? "ok"
      : "idle";
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [devices, setDevices] = useState<{ cam: string; mic: string }>({
    cam: "Cámara verificada previamente",
    mic: "Micrófono verificado previamente",
  });

  useEffect(() => {
    onStatus?.(status);
    if (status === "ok" && typeof window !== "undefined") {
      sessionStorage.setItem("educa_av_ok", "true");
    }
  }, [status, onStatus]);

  const stopTest = useCallback(() => {
    runIdRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setMicLevel(0);
  }, []);

  async function startTest() {
    stopTest();
    const runId = runIdRef.current;
    setStatus("idle");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("ok");
      if (typeof window !== "undefined") sessionStorage.setItem("educa_av_ok", "true");
      setDevices({
        cam: stream.getVideoTracks()[0]?.label || "Cámara activa",
        mic: stream.getAudioTracks()[0]?.label || "Micrófono activo",
      });

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      stopTest();
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo acceder a la cámara/micrófono",
      );
    }
  }

  useEffect(() => stopTest, [stopTest]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-slate-800">
          Prueba de cámara y micrófono
        </h3>
        {status === "ok" && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            ✓ Verificado
          </span>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {status === "ok" && !streamRef.current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white p-4 text-center">
            <span className="text-3xl mb-2">🎥</span>
            <p className="text-sm font-semibold">Cámara y Micrófono Verificados</p>
            <p className="text-xs text-slate-400 mt-1">Listo para entrar a clase directamente</p>
          </div>
        )}
      </div>

      {status === "ok" && (
        <>
          {streamRef.current && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-500 font-medium">Nivel de micrófono</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div className="truncate rounded-lg bg-slate-100/70 px-3 py-2 border border-slate-200/60 font-medium">
              📷 {devices.cam}
            </div>
            <div className="truncate rounded-lg bg-slate-100/70 px-3 py-2 border border-slate-200/60 font-medium">
              🎙 {devices.mic}
            </div>
          </div>
        </>
      )}

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          {errorMsg}. Revisa los permisos del navegador.
        </p>
      )}

      <Button className="mt-4 w-full" variant={status === "ok" ? "secondary" : "primary"} onClick={startTest}>
        {status === "ok" ? "Volver a probar cámara y micrófono" : "Probar cámara y micrófono"}
      </Button>
    </Card>
  );
}
