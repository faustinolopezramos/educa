import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { Badge, Button, Card, Input, PageTitle } from "../components/ui";
import { apiErrorMessage } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useEnrollments, useLobbyJoinInfo, useSchedules, useSession, useUpdateSession } from "../lib/queries";
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

  // The teacher who owns this schedule is the host: they open the room, not wait.
  const isHost = !!user && !!schedule && schedule.teacher_id === user.id;
  const isSavedAvOk = typeof window !== "undefined" && sessionStorage.getItem("educa_av_ok") === "true";
  const avReady = av === "ok" || isSavedAvOk;

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
  const isVirtual = schedule?.modality === "virtual";
  const joinUrl = lobbyInfo?.host_url ?? lobbyInfo?.join_url ?? (isVirtual ? (schedule?.join_url ?? null) : null);
  const missingLink = isVirtual && !joinUrl;
  const overdue = remaining <= 0;

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
        <Badge color={isVirtual ? "indigo" : "slate"}>
          {isVirtual ? "Virtual" : "Presencial"}
        </Badge>
      </div>

      <div className="my-5">
        {started ? (
          <div className="font-serif text-2xl font-medium text-green-700">
            La clase está en curso
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

      {started ? (
        <>
          <ul className="mb-5 space-y-2.5">
            <CheckItem done label="Sesión marcada como dada" />
            <CheckItem done={!!topic.trim()} label={topic.trim() ? `Tema: ${topic.trim()}` : "Sin tema anotado"} pending />
          </ul>
          {joinUrl && (
            <Button className="w-full" onClick={openRoom}>
              Volver a abrir la sala →
            </Button>
          )}
          <Link
            to="/"
            className="mt-2 block w-full rounded-xl bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-brand-700 transition hover:bg-slate-100"
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
                className="w-full"
                disabled={update.isPending}
                onClick={start}
              >
                {update.isPending ? "Iniciando…" : "Iniciar la clase →"}
              </Button>
              <p className="mt-2 text-center text-xs text-slate-400">
                {isVirtual
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
  // The lobby endpoint is the only source of the link for a student: it is what
  // enforces the class window server-side. Falling back to `schedule.join_url`
  // used to hand the link over regardless of the hour — and the backend no
  // longer sends that field to students anyway. No lobby answer yet means "not
  // allowed in", never "let them in".
  const joinUrl = lobbyInfo?.join_url ?? null;
  const canJoin = lobbyInfo?.can_join ?? false;

  return (
    <Card>
      <div className="text-sm text-slate-500">Tu clase · inicio {formatDateTime(startIso)}</div>
      <div className="my-5">
        {canJoin ? (
          <div className="font-serif text-2xl font-medium text-green-700">
            La sala está lista
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

      {/* Checklist "listo para entrar" */}
      <ul className="mb-5 space-y-2.5">
        <CheckItem done={avReady} label="Cámara detectada" />
        <CheckItem done={avReady} label="Micrófono con señal" />
        <CheckItem
          done={canJoin}
          label={canJoin ? "La sala está abierta" : "El profesor abrirá la sala en breve"}
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
          className={`block w-full rounded-xl px-3 py-3 text-center text-sm font-semibold transition ${
            canJoin && avReady
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "cursor-not-allowed bg-slate-200 text-slate-400"
          }`}
          onClick={(e) => {
            if (!(canJoin && avReady)) e.preventDefault();
          }}
        >
          {!avReady
            ? "Prueba tu cámara y micrófono primero"
            : canJoin
              ? "Entrar a la clase →"
              : "Disponible al iniciar"}
        </a>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
          {schedule?.modality === "presencial"
            ? "Clase presencial — acude al aula asignada."
            : "El profesor aún no ha publicado el enlace de la clase."}
        </p>
      )}
      <p className="mt-2 text-center text-xs text-slate-400">
        Se abrirá Zoom / Meet / Teams en una pestaña nueva.
      </p>
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
