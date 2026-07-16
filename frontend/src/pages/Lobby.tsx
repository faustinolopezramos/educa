import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button, Card, PageTitle } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { useMeeting } from "../lib/queries";

export function Lobby() {
  const { meetingId } = useParams();
  const id = Number(meetingId);
  const { data: meeting, isLoading, isError } = useMeeting(id);

  const [remaining, setRemaining] = useState<number>(0);

  // Tick the countdown every second based on the meeting start time.
  useEffect(() => {
    if (!meeting) return;
    const start = new Date(meeting.start_time).getTime();
    const update = () => setRemaining(Math.max(0, start - Date.now()));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [meeting]);

  if (isLoading) return <p className="text-slate-500">Cargando lobby…</p>;
  if (isError || !meeting)
    return (
      <div>
        <p className="text-red-600">No se pudo cargar la clase.</p>
        <Link to="/" className="text-brand-600 hover:underline">
          ← Volver
        </Link>
      </div>
    );

  const canJoin = remaining <= 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PageTitle>Lobby Virtual</PageTitle>
        <Link to="/" className="text-sm text-brand-600 hover:underline">
          ← Volver
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MediaTest />

        <div className="space-y-6">
          <Card>
            <h3 className="mb-2 font-medium">Tu clase</h3>
            <p className="text-sm text-slate-500">
              Inicio: {formatDateTime(meeting.start_time)}
            </p>
            <div className="my-6 text-center">
              {canJoin ? (
                <div className="text-2xl font-semibold text-green-600">
                  ¡La clase está lista!
                </div>
              ) : (
                <>
                  <div className="text-sm text-slate-500">Comienza en</div>
                  <Countdown ms={remaining} />
                </>
              )}
            </div>
            <a
              href={canJoin ? (meeting.join_url ?? "#") : undefined}
              target="_blank"
              rel="noreferrer"
              className={`block w-full rounded-md px-3 py-3 text-center text-sm font-medium transition ${
                canJoin
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
              onClick={(e) => {
                if (!canJoin) e.preventDefault();
              }}
            >
              {canJoin ? "Entrar a la clase" : "Disponible al iniciar"}
            </a>
            <p className="mt-2 text-center text-xs text-slate-400">
              Se abrirá Zoom / Meet / Teams en una pestaña nueva.
            </p>
          </Card>

          <Card>
            <h3 className="mb-2 font-medium">Materiales del día</h3>
            <p className="text-sm text-slate-400">
              (Placeholder) Aquí aparecerán los materiales previos a la clase.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Countdown({ ms }: { ms: number }) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="mt-1 font-mono text-4xl font-bold text-brand-600">
      {h > 0 && `${pad(h)}:`}
      {pad(m)}:{pad(s)}
    </div>
  );
}

// Camera + microphone check using the Web MediaDevices API.
function MediaTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  async function startTest() {
    setStatus("idle");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("ok");

      // Visualize microphone input level.
      const audioCtx = new AudioContext();
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
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo acceder a la cámara/micrófono",
      );
    }
  }

  // Release camera/mic when leaving the lobby.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card>
      <h3 className="mb-3 font-medium">Prueba de cámara y micrófono</h3>
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </div>

      {status === "ok" && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-slate-500">Nivel de micrófono</div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${micLevel}%` }}
            />
          </div>
        </div>
      )}

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          {errorMsg}. Revisa los permisos del navegador.
        </p>
      )}

      <Button className="mt-4 w-full" onClick={startTest}>
        {status === "ok" ? "Reintentar prueba" : "Probar cámara y micrófono"}
      </Button>
    </Card>
  );
}
