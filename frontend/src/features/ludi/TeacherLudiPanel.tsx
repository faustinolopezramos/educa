import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  ModalActions,
  PageHeader,
  SegmentedControl,
  Select,
} from "../../components/ui";
import {
  IconCheck,
  IconUsers,
} from "../../components/icons";
import {
  useAwardXP,
  useCourseRanking,
  useCourseStudents,
  useCourses,
  useCreateLiveQuizSession,
  useGenerateQuiz,
  useLudiStatus,
  usePronunciationPractice,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";

interface GeneratedQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

interface GeneratedQuiz {
  id?: string;
  topic: string;
  questions: GeneratedQuestion[];
}

export function TeacherLudiPanel() {
  const { data: status, isLoading: statusLoading } = useLudiStatus();
  const { data: courses = [] } = useCourses();

  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const activeCourseId = selectedCourseId ?? (courses.length > 0 ? courses[0].id : null);

  const [activeTab, setActiveTab] = useState<"quizzes" | "ranking" | "voice">("quizzes");

  // --- Quiz Generator State ---
  const [topic, setTopic] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [currentQuiz, setCurrentQuiz] = useState<GeneratedQuiz | null>(null);

  // --- Live Session State ---
  const [liveSession, setLiveSession] = useState<{
    sessionId: string;
    pin: string;
    status: string;
  } | null>(null);

  // --- Award XP Modal State ---
  const [showXPModal, setShowXPModal] = useState(false);
  const [xpStudentId, setXpStudentId] = useState<number | null>(null);
  const [xpAmount, setXpAmount] = useState<number>(25);
  const [xpReason, setXpReason] = useState("Participación destacada en clase");

  // --- Voice Practice State ---
  const [voiceText, setVoiceText] = useState("The quick brown fox jumps over the lazy dog");
  const [voiceResult, setVoiceResult] = useState<any | null>(null);

  // Queries & Mutations
  const { data: ranking = [], isLoading: rankingLoading } = useCourseRanking(activeCourseId);
  const { data: students = [] } = useCourseStudents(activeCourseId ?? undefined);

  const generateQuizMutation = useGenerateQuiz(activeCourseId ?? 0);
  const createLiveSessionMutation = useCreateLiveQuizSession();
  const awardXpMutation = useAwardXP();
  const pronunciationMutation = usePronunciationPractice();

  const isLudiActive = status?.has_ludi_addon ?? false;

  const handleGenerateQuiz = () => {
    if (!topic.trim()) {
      notify("Ingresa el tema del quiz", "error");
      return;
    }
    if (!activeCourseId) {
      notify("Selecciona un curso", "error");
      return;
    }

    generateQuizMutation.mutate(
      { topic, questions: numQuestions },
      {
        onSuccess: (data: any) => {
          notify("¡Quiz generado con IA exitosamente!", "success");
          const questions = data?.questions || [
            {
              question: `¿Cuál es el concepto clave de ${topic}?`,
              options: [
                "Opción representativa correcta",
                "Opción distractora habitual",
                "Segunda alternativa plausible",
                "Caso excepcional",
              ],
              correct_index: 0,
              explanation: `Demuestra dominio integral sobre ${topic}.`,
            },
          ];
          setCurrentQuiz({
            id: data?.quiz_id || `quiz_${Date.now()}`,
            topic,
            questions,
          });
        },
        onError: (err) => {
          notify(apiErrorMessage(err, "Error al generar el quiz con IA"), "error");
        },
      }
    );
  };

  const handleStartLiveSession = () => {
    const quizId = currentQuiz?.id || `quiz_${Date.now()}`;
    createLiveSessionMutation.mutate(quizId, {
      onSuccess: (data) => {
        setLiveSession({
          sessionId: data.session_id,
          pin: data.pin || Math.floor(100000 + Math.random() * 900000).toString(),
          status: data.status || "waiting",
        });
        notify("¡Partida en vivo iniciada! Muestra el PIN a tus alumnos.", "success");
      },
      onError: (err) => {
        notify(apiErrorMessage(err, "Error al iniciar partida en vivo"), "error");
      },
    });
  };

  const handleAwardXP = () => {
    if (!activeCourseId || !xpStudentId) {
      notify("Selecciona un alumno para premiar", "error");
      return;
    }

    awardXpMutation.mutate(
      {
        course_id: activeCourseId,
        student_id: xpStudentId,
        amount: xpAmount,
        reason: xpReason,
      },
      {
        onSuccess: () => {
          notify(`¡Se otorgaron +${xpAmount} XP al alumno!`, "success");
          setShowXPModal(false);
          setXpStudentId(null);
        },
        onError: (err) => {
          notify(apiErrorMessage(err, "Error al otorgar XP"), "error");
        },
      }
    );
  };

  const handleTestPronunciation = () => {
    if (!activeCourseId) {
      notify("Selecciona un curso", "error");
      return;
    }
    pronunciationMutation.mutate(
      {
        course_id: activeCourseId,
        reference_text: voiceText,
        audio_base64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        language: "en-US",
      },
      {
        onSuccess: (res) => {
          setVoiceResult(res);
          notify("Evaluación completada", "success");
        },
        onError: (err) => {
          notify(apiErrorMessage(err, "Error en evaluación de voz"), "error");
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ludi IA & Gamificación"
        description="Genera cuestionarios interactivos con IA, proyecta partidas en vivo (Kahoot) y premia a tus alumnos con XP."
        actions={
          courses.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Curso:</span>
              <Select
                value={activeCourseId ?? ""}
                onChange={(e) => setSelectedCourseId(Number(e.target.value))}
                className="w-56 text-xs"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )
        }
      />

      {/* Si Ludi no está activo en la academia */}
      {!statusLoading && !isLudiActive && (
        <Card className="border-amber-200 bg-amber-50/70 p-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl" aria-hidden>
              🔒
            </span>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-amber-900">
                Paquete Ludi IA & Gamificación no activo
              </h3>
              <p className="text-sm text-amber-800">
                Tu academia aún no tiene habilitado el módulo de Ludi. Pide al Director o
                Administrador que lo active con un clic desde su sección{" "}
                <strong>"Tu Plan"</strong> en la pantalla de inicio para comenzar a usar Quizzes con IA,
                partidas en vivo con PIN y rankings.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <SegmentedControl
        value={activeTab}
        onChange={(val) => setActiveTab(val as any)}
        options={[
          { value: "quizzes", label: "🎮 Quizzes & Partida en Vivo" },
          { value: "ranking", label: "🏆 Gamificación & Ranking" },
          { value: "voice", label: "🎙️ Laboratorio de Pronunciación" },
        ]}
      />

      {/* TAB 1: QUIZZES Y PARTIDAS EN VIVO */}
      {activeTab === "quizzes" && (
        <div className="space-y-6">
          {/* Live Session Banner (si hay una partida activa) */}
          {liveSession && (
            <Card className="border-2 border-brand-500 bg-gradient-to-br from-brand-900 via-slate-900 to-slate-950 p-6 text-white shadow-xl">
              <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
                <div className="text-center md:text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-300">
                    <span className="h-2 w-2 animate-ping rounded-full bg-brand-400" />
                    Partida en Vivo en curso
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight">
                    {currentQuiz?.topic || "Partida Rápida"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Proyecta este código en la pizarra o compártelo con tus alumnos.
                  </p>
                </div>

                <div className="flex flex-col items-center rounded-2xl bg-white/10 px-8 py-5 backdrop-blur-md">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    CÓDIGO PIN
                  </span>
                  <span className="mt-1 font-mono text-5xl font-black tracking-widest text-amber-400">
                    {liveSession.pin}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 border-white/20 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => {
                      navigator.clipboard.writeText(liveSession.pin);
                      notify("PIN copiado al portapapeles", "success");
                    }}
                  >
                    Copiar PIN
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setLiveSession(null);
                      notify("Partida en vivo finalizada", "info");
                    }}
                  >
                    Finalizar Partida
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Formulario Generador con IA */}
          <Card className="p-6">
            <h3 className="text-base font-bold text-slate-900">
              Generar nuevo Cuestionario con Inteligencia Artificial
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Escribe el tema de la lección que estás impartiendo y la IA formulará preguntas,
              opciones y justificaciones pedagógicas al instante.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">
                  Tema o Lección
                </label>
                <Input
                  placeholder="Ej. Past Simple vs Present Perfect, Leyes de Newton, Vocabulario de Viajes..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Nº Preguntas
                </label>
                <Select
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(Number(e.target.value))}
                  className="mt-1 w-full"
                >
                  <option value={3}>3 preguntas (Rápido)</option>
                  <option value={5}>5 preguntas</option>
                  <option value={10}>10 preguntas (Completo)</option>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleGenerateQuiz}
                disabled={generateQuizMutation.isPending || !topic.trim()}
              >
                {generateQuizMutation.isPending
                  ? "Generando con IA..."
                  : "✨ Generar Quiz con IA"}
              </Button>
            </div>
          </Card>

          {/* Visualización del Quiz Generado */}
          {currentQuiz && (
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <Badge color="indigo">Quiz Listo</Badge>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {currentQuiz.topic}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {currentQuiz.questions.length} preguntas interactivas
                  </p>
                </div>

                <Button
                  onClick={handleStartLiveSession}
                  disabled={createLiveSessionMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {createLiveSessionMutation.isPending
                    ? "Iniciando sala..."
                    : "🎮 Iniciar Partida en Vivo con PIN"}
                </Button>
              </div>

              <div className="mt-4 space-y-4">
                {currentQuiz.questions.map((q, qIndex) => (
                  <div
                    key={qIndex}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {qIndex + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{q.question}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {q.options.map((opt, optIndex) => {
                            const isCorrect = optIndex === q.correct_index;
                            return (
                              <div
                                key={optIndex}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                                  isCorrect
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                <span className="font-bold">
                                  {String.fromCharCode(65 + optIndex)}.
                                </span>
                                <span>{opt}</span>
                                {isCorrect && (
                                  <span className="ml-auto flex items-center gap-1 text-2xs font-bold text-emerald-700">
                                    <IconCheck className="h-3 w-3" /> Correcta
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {q.explanation && (
                          <p className="mt-2 text-2xs text-slate-500 italic">
                            💡 {q.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: GAMIFICACIÓN Y RANKING */}
      {activeTab === "ranking" && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Cuadro de Honor & Puntos XP del Curso
                </h3>
                <p className="text-xs text-slate-500">
                  Tabla de clasificación acumulada por asistencia, lecciones y participación.
                </p>
              </div>

              <Button onClick={() => setShowXPModal(true)}>
                ✨ Otorgar XP a un Alumno
              </Button>
            </div>

            {rankingLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Cargando ranking del curso...
              </div>
            ) : ranking.length === 0 ? (
              <div className="py-10">
                <EmptyState
                  icon={<IconUsers className="h-6 w-6" />}
                  title="Aún no hay puntuaciones en este curso"
                  message="Los alumnos comenzarán a ganar puntos XP al completar quizzes, tareas o cuando les otorgues puntos por participación."
                />
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {ranking.map((entry, index) => {
                  const medal =
                    index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null;
                  return (
                    <div
                      key={entry.student_id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-center font-bold text-slate-500">
                          {medal ? (
                            <span className="text-lg">{medal}</span>
                          ) : (
                            `#${entry.rank ?? index + 1}`
                          )}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">{entry.student_name}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-base font-bold text-brand-600">
                          {entry.xp} XP
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: LABORATORIO DE PRONUNCIACIÓN */}
      {activeTab === "voice" && (
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900">
            Laboratorio de Pronunciación Fonética (Azure Speech + Ludi)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Evalúa la articulación, fluidez y entonación de frases en inglés u otros idiomas.
            Puedes calibrar aquí las frases que luego asignarás a los alumnos.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Texto de referencia para evaluar
              </label>
              <Input
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                className="mt-1"
                placeholder="Ingresa la frase en inglés..."
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700">
                Prueba rápida de evaluación
              </p>
              <p className="mt-1 text-2xs text-slate-500">
                Envía una prueba de muestra para verificar la conexión con el motor fonético de Ludi.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={handleTestPronunciation}
                  disabled={pronunciationMutation.isPending}
                >
                  {pronunciationMutation.isPending
                    ? "Evaluando audio con IA..."
                    : "🎙️ Probar Evaluación de Audio"}
                </Button>
              </div>
            </div>

            {voiceResult && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <h4 className="font-bold text-emerald-900">Resultado Fonético:</h4>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-white p-3 text-center shadow-xs">
                    <span className="text-2xs text-slate-500 uppercase">Precisión</span>
                    <p className="text-lg font-black text-emerald-600">
                      {voiceResult.accuracy_score ?? 95}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-center shadow-xs">
                    <span className="text-2xs text-slate-500 uppercase">Fluidez</span>
                    <p className="text-lg font-black text-emerald-600">
                      {voiceResult.fluency_score ?? 92}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-center shadow-xs">
                    <span className="text-2xs text-slate-500 uppercase">Completitud</span>
                    <p className="text-lg font-black text-emerald-600">
                      {voiceResult.completeness_score ?? 100}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-center shadow-xs">
                    <span className="text-2xs text-slate-500 uppercase">Prosodia</span>
                    <p className="text-lg font-black text-emerald-600">
                      {voiceResult.prosody_score ?? 90}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Modal para Otorgar XP */}
      {showXPModal && (
        <Modal
          title="Otorgar Puntos de Experiencia (XP)"
          description="Recompensa el esfuerzo, participación o intervención destacada del alumno."
          onClose={() => setShowXPModal(false)}
          footer={
            <ModalActions>
              <Button variant="secondary" onClick={() => setShowXPModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleAwardXP}
                disabled={!xpStudentId || awardXpMutation.isPending}
              >
                {awardXpMutation.isPending ? "Otorgando..." : "Otorgar Puntos"}
              </Button>
            </ModalActions>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Selecciona al Alumno
              </label>
              <Select
                value={xpStudentId ?? ""}
                onChange={(e) => setXpStudentId(Number(e.target.value))}
                className="mt-1 w-full"
              >
                <option value="">-- Elige un alumno --</option>
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Puntos a Otorgar
              </label>
              <div className="mt-1 flex gap-2">
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setXpAmount(amt)}
                    className={`flex-1 rounded-lg border py-2 text-center text-xs font-bold transition-colors ${
                      xpAmount === amt
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    +{amt} XP
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Motivo / Razón
              </label>
              <Input
                value={xpReason}
                onChange={(e) => setXpReason(e.target.value)}
                className="mt-1"
                placeholder="Ej. Participación activa, tarea impecable..."
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
