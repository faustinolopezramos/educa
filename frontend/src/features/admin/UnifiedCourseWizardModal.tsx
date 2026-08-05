import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  ModalActions,
  Select,
} from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS, calculateEndDate, needsLink, usesRoom } from "../../lib/format";
import { JORNADA_PRESETS } from "../../lib/jornadas";
import {
  useAssignCourseTeacher,
  useCreateCourse,
  useCreateSchedule,
  useLanguages,
  useLevels,
  useRooms,
  useSchedules,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import type { Modality } from "../../lib/types";

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export function UnifiedCourseWizardModal({ onClose, onSuccess }: Props) {
  const { data: levels = [] } = useLevels();
  const { data: languages = [] } = useLanguages();
  const { data: teachers = [] } = useUsers("teacher");
  const { data: rooms = [] } = useRooms();
  const { data: existingSchedules = [] } = useSchedules();

  const createCourse = useCreateCourse();
  const assignTeacher = useAssignCourseTeacher();
  const createSchedule = useCreateSchedule();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Course Info & Duration
  const [levelId, setLevelId] = useState<number>(0);
  const [courseName, setCourseName] = useState("");
  const [maxStudents, setMaxStudents] = useState<number>(20);
  const [periodicity, setPeriodicity] = useState<string>("mensual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  function handlePeriodicityOrDateChange(newPeriodicity: string, newStart: string) {
    setPeriodicity(newPeriodicity);
    setStartDate(newStart);
    if (!newStart) return;
    const calcEnd = calculateEndDate(newStart, newPeriodicity);
    if (calcEnd) {
      setEndDate(calcEnd);
    }
  }

  // Step 2: Pre-established Schedules & Modality
  const [selectedJornada, setSelectedJornada] = useState<string>("");
  const [modality, setModality] = useState<Modality>("virtual");
  const [roomId, setRoomId] = useState<number>(0);
  const [joinUrl, setJoinUrl] = useState("");
  const [customSlots, setCustomSlots] = useState<
    { day_of_week: number; start_time: string; end_time: string }[]
  >([{ day_of_week: 0, start_time: "08:00:00", end_time: "10:00:00" }]);

  // Step 3: Teacher Selection & Adaptation Check
  const [teacherId, setTeacherId] = useState<number>(0);
  const [isLead, setIsLead] = useState(true);

  const selectedLevel = levels.find((l) => l.id === levelId);
  const selectedLanguage = selectedLevel
    ? languages.find((lang) => lang.id === selectedLevel.language_id)
    : null;

  // Auto fill course name if empty when level is picked
  function handleLevelChange(id: number) {
    setLevelId(id);
    const lvl = levels.find((l) => l.id === id);
    if (lvl && !courseName.trim()) {
      const year = new Date().getFullYear();
      setCourseName(`${lvl.name} — Trimestre ${year}Q1`);
    }
  }

  function handleJornadaSelect(label: string) {
    setSelectedJornada(label);
    const preset = JORNADA_PRESETS.find((p) => p.label === label);
    if (preset) {
      setCustomSlots(preset.slots);
    }
  }

  function addCustomSlot() {
    setCustomSlots([
      ...customSlots,
      { day_of_week: 0, start_time: "10:00:00", end_time: "12:00:00" },
    ]);
  }

  function removeCustomSlot(index: number) {
    if (customSlots.length === 1) return;
    setCustomSlots(customSlots.filter((_, i) => i !== index));
  }

  // Check teacher availability against customSlots
  function getTeacherAvailability(tId: number): { available: boolean; detail?: string } {
    const teacherSchedules = existingSchedules.filter((s) => s.teacher_id === tId);
    for (const slot of customSlots) {
      const clash = teacherSchedules.find((s) => {
        if (s.day_of_week !== slot.day_of_week) return false;
        // Check time overlap
        return s.start_time < slot.end_time && s.end_time > slot.start_time;
      });
      if (clash) {
        return {
          available: false,
          detail: `Conflicto el ${DAYS[clash.day_of_week]} (${clash.start_time.slice(
            0,
            5
          )}–${clash.end_time.slice(0, 5)})`,
        };
      }
    }
    return { available: true };
  }

  async function handleFinish() {
    setError(null);
    if (!levelId || !courseName.trim()) {
      setError("Por favor completa los datos del curso en el Paso 1.");
      setStep(1);
      return;
    }

    setLoading(true);

    try {
      // 1. Create Course
      const newCourse = await createCourse.mutateAsync({
        level_id: levelId,
        name: courseName.trim(),
        max_students: maxStudents,
        start_date: startDate || null,
        end_date: endDate || null,
      });

      // 2. Assign Teacher (if selected)
      if (teacherId) {
        await assignTeacher.mutateAsync({
          courseId: newCourse.id,
          teacher_id: teacherId,
          is_lead: isLead,
        });
      }

      // 3. Create Schedules with pre-established slots
      const activeSlots = customSlots;
      const effectiveTeacherId = teacherId || (teachers[0]?.id ?? 1);
      for (const slot of activeSlots) {
        await createSchedule.mutateAsync({
          course_id: newCourse.id,
          teacher_id: effectiveTeacherId,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          modality,
          room_id: usesRoom(modality) && roomId ? roomId : undefined,
          join_url: needsLink(modality) && joinUrl.trim() ? joinUrl.trim() : undefined,
        });
      }

      notify("Curso, horarios y profesor registrados con éxito", "success");
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Error al crear la estructura del curso"));
    } finally {
      setLoading(false);
    }
  }

  // Pinned action bar shared by the three steps, so "Siguiente" never scrolls
  // away and always sits in the same corner.
  const footer = (
    <ModalActions hint={`Paso ${step} de 3`}>
      {step === 1 && (
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!levelId || !courseName.trim()} onClick={() => setStep(2)}>
            Siguiente: horarios →
          </Button>
        </>
      )}
      {step === 2 && (
        <>
          <Button variant="secondary" onClick={() => setStep(1)}>
            ← Atrás
          </Button>
          <Button onClick={() => setStep(3)}>Siguiente: profesor →</Button>
        </>
      )}
      {step === 3 && (
        <>
          <Button variant="secondary" onClick={() => setStep(2)}>
            ← Atrás
          </Button>
          <Button disabled={loading} onClick={handleFinish}>
            {loading ? "Creando estructura…" : "Confirmar y crear curso"}
          </Button>
        </>
      )}
    </ModalActions>
  );

  return (
    <Modal
      title="Nuevo curso"
      description="Datos del curso, sus franjas semanales y el profesor que lo imparte."
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-6">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                step === 1
                  ? "bg-brand-600 text-white"
                  : "bg-brand-100 text-brand-700"
              }`}
            >
              1
            </div>
            <span
              className={`text-xs font-semibold ${
                step === 1 ? "text-slate-900" : "text-slate-400"
              }`}
            >
              Datos & Fechas
            </span>
          </div>

          <div className="h-0.5 w-8 bg-slate-200" />

          <div className="flex items-center space-x-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                step === 2
                  ? "bg-brand-600 text-white"
                  : step > 2
                  ? "bg-brand-100 text-brand-700"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              2
            </div>
            <span
              className={`text-xs font-semibold ${
                step === 2 ? "text-slate-900" : "text-slate-400"
              }`}
            >
              Horarios Fijos
            </span>
          </div>

          <div className="h-0.5 w-8 bg-slate-200" />

          <div className="flex items-center space-x-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                step === 3
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              3
            </div>
            <span
              className={`text-xs font-semibold ${
                step === 3 ? "text-slate-900" : "text-slate-400"
              }`}
            >
              Profesor Adaptable
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* STEP 1: Datos del Curso & Duración */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nivel Académico" required={true}>
                <Select
                  value={levelId}
                  onChange={(e) => handleLevelChange(Number(e.target.value))}
                >
                  <option value={0}>Selecciona un nivel…</option>
                  {levels.map((l) => {
                    const lang = languages.find((g) => g.id === l.language_id);
                    return (
                      <option key={l.id} value={l.id}>
                        {lang ? `${lang.name} · ` : ""}{l.code} ({l.name})
                      </option>
                    );
                  })}
                </Select>
              </Field>

              <Field label="Cupo Máximo" required={true}>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxStudents}
                  onChange={(e) => setMaxStudents(Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Nombre del Curso" required={true}>
              <Input
                placeholder="Ej. Inglés General A1 — Mañana"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Periodicidad del Curso" required={true}>
                <Select
                  value={periodicity}
                  onChange={(e) => handlePeriodicityOrDateChange(e.target.value, startDate)}
                >
                  <option value="mensual">Mensual (1 mes)</option>
                  <option value="bimensual">Bimensual (2 meses)</option>
                  <option value="trimestral">Trimestral (3 meses)</option>
                  <option value="cuatrimestral">Cuatrimestral (4 meses)</option>
                  <option value="semestral">Semestral (6 meses)</option>
                  <option value="anual">Anual (1 año)</option>
                  <option value="custom">Personalizado</option>
                </Select>
              </Field>

              <Field label="Fecha Inicio">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => handlePeriodicityOrDateChange(periodicity, e.target.value)}
                />
              </Field>

              <Field label="Fecha Fin (Sugerida)">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>

            {selectedLanguage && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-800 flex items-center justify-between">
                <span>
                  <strong>Área Académica:</strong> {selectedLanguage.name} (
                  {selectedLanguage.kind})
                </span>
                <Badge color="indigo">{selectedLanguage.kind}</Badge>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Horarios Fijos & Modalidad */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Modalidad de Clase">
                <Select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as Modality)}
                >
                  <option value="virtual">Virtual (En línea)</option>
                  <option value="presencial">Presencial (Aula física)</option>
                  <option value="semi_presencial">Semi Presencial (Híbrida)</option>
                </Select>
              </Field>

              {/* Los dos campos, cada uno según lo que la modalidad necesita.
                  Semi presencial pide ambos: antes el formulario sólo mostraba
                  el aula pero el envío incluía un enlace que nunca se podía
                  escribir, así que la mitad en línea nacía vacía siempre. */}
              {usesRoom(modality) && (
                <Field label="Aula Asignada">
                  <Select
                    value={roomId}
                    onChange={(e) => setRoomId(Number(e.target.value))}
                  >
                    <option value={0}>Selecciona aula…</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (Capacidad: {r.capacity})
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {needsLink(modality) && (
                <Field label="Enlace Virtual / Reunión">
                  <Input
                    placeholder="https://zoom.us/j/123456..."
                    value={joinUrl}
                    onChange={(e) => setJoinUrl(e.target.value)}
                  />
                </Field>
              )}
            </div>
            {modality === "semi_presencial" && (
              <p className="mt-2 text-2xs text-slate-500">
                Una clase semi presencial se da en el aula y en línea a la vez:
                necesita las dos cosas.
              </p>
            )}

            {/* Plantilla de Jornadas */}
            <Field label="Plantilla de Jornada Predefinida (Opcional)">
              <Select
                value={selectedJornada}
                onChange={(e) => handleJornadaSelect(e.target.value)}
              >
                <option value="">Configuración manual de días/horas…</option>
                {JORNADA_PRESETS.map((p, idx) => (
                  <option key={idx} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Lista de franjas horarias */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Franjas Horarias Establecidas
                </h4>
                <button
                  type="button"
                  onClick={addCustomSlot}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  + Agregar Día
                </button>
              </div>

              {customSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 sm:grid-cols-3 items-center rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                >
                  <Select
                    value={slot.day_of_week}
                    onChange={(e) => {
                      const copy = [...customSlots];
                      copy[idx].day_of_week = Number(e.target.value);
                      setCustomSlots(copy);
                    }}
                  >
                    {DAYS.map((d, dIdx) => (
                      <option key={dIdx} value={dIdx}>
                        {d}
                      </option>
                    ))}
                  </Select>

                  <Input
                    type="time"
                    value={slot.start_time.slice(0, 5)}
                    onChange={(e) => {
                      const copy = [...customSlots];
                      copy[idx].start_time = `${e.target.value}:00`;
                      setCustomSlots(copy);
                    }}
                  />

                  <div className="flex items-center space-x-2">
                    <Input
                      type="time"
                      value={slot.end_time.slice(0, 5)}
                      onChange={(e) => {
                        const copy = [...customSlots];
                        copy[idx].end_time = `${e.target.value}:00`;
                        setCustomSlots(copy);
                      }}
                    />
                    {customSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCustomSlot(idx)}
                        className="text-red-500 hover:text-red-700 font-bold px-1"
                        title="Eliminar franja"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* STEP 3: Selección de Profesor Adaptable */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Evaluación de Adaptabilidad del Profesor
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                El sistema valida en tiempo real si la agenda del docente no choca con los horarios preestablecidos.
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {teachers.length === 0 ? (
                <div className="text-slate-400 italic text-xs py-4 text-center">
                  No hay profesores registrados.
                </div>
              ) : (
                teachers.map((t) => {
                  const check = getTeacherAvailability(t.id);
                  const isSelected = teacherId === t.id;

                  return (
                    <div
                      key={t.id}
                      onClick={() => setTeacherId(t.id)}
                      className={`cursor-pointer rounded-xl border p-3 transition flex items-center justify-between ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                            isSelected
                              ? "bg-brand-600 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {t.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            {t.full_name}
                          </div>
                          <div className="text-[11px] text-slate-500">{t.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {check.available ? (
                          <Badge color="green" dot>
                            Disponible
                          </Badge>
                        ) : (
                          <Badge color="red" dot>
                            {check.detail || "Conflicto de Horario"}
                          </Badge>
                        )}
                        <input
                          type="radio"
                          name="teacher_select"
                          checked={isSelected}
                          onChange={() => setTeacherId(t.id)}
                          className="text-brand-600 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {teacherId > 0 && (
              <label className="flex items-center space-x-2 text-xs font-medium text-slate-700 pt-2">
                <input
                  type="checkbox"
                  checked={isLead}
                  onChange={(e) => setIsLead(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Designar como Profesor Titular / Principal del curso</span>
              </label>
            )}

            <Card className="bg-slate-50 border-slate-200/80 p-3">
              <h4 className="text-xs font-semibold text-slate-800 mb-1">
                📌 Resumen de Estructura Fija
              </h4>
              <p className="text-xs text-slate-600">
                <strong>Curso:</strong> {courseName || "Sin nombre"} |{" "}
                <strong>Cupo:</strong> {maxStudents} alumnos
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                <strong>Horario Fijo:</strong> {customSlots.length} franja(s) semanales
              </p>
            </Card>

          </div>
        )}
      </div>
    </Modal>
  );
}
