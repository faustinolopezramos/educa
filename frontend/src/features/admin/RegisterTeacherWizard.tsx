import { useState } from "react";

import { Button, Field, Input, Modal, ModalActions, Select, TimePicker } from "../../components/ui";
import { apiErrorMessage } from "../../lib/api";
import { DAYS } from "../../lib/format";
import { JORNADA_PRESETS } from "../../lib/jornadas";
import {
  useAssignCourseTeacher,
  useCheckScheduleConflict,
  useCourses,
  useCreateSchedule,
  useCreateUser,
  useLanguages,
  useRooms,
  useSetTeacherLanguages,
  useUsers,
} from "../../lib/queries";
import { notify } from "../../lib/toast";
import {
  formatCuiPassport,
  formatPhoneNumber,
  validateCuiPassport,
  validateEmailFormat,
  validateFullNameFormat,
} from "../../lib/validation";

interface Props {
  initialCourseId?: number;
  initialTeacherId?: number;
  onClose: () => void;
}

function calculateDurationText(start: string, end: string): string {
  if (!start || !end) return "";
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
  if (totalMinutes <= 0) return "Hora de fin debe ser posterior a la de inicio";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m por clase`;
  if (hours > 0) return `${hours} ${hours === 1 ? "hora" : "horas"} por clase`;
  return `${mins} minutos por clase`;
}

export function RegisterTeacherWizard({ initialCourseId, initialTeacherId, onClose }: Props) {
  const { data: teachers = [] } = useUsers("teacher");
  const { data: courses = [] } = useCourses();
  const { data: languages = [] } = useLanguages();
  const { data: rooms = [] } = useRooms();

  const createUser = useCreateUser();
  const setLanguages = useSetTeacherLanguages();
  const assignCourseTeacher = useAssignCourseTeacher();
  const checkConflict = useCheckScheduleConflict();
  const createSchedule = useCreateSchedule();

  const [teacherMode, setTeacherMode] = useState<"new" | "existing">(
    initialTeacherId ? "existing" : "new",
  );

  // New Teacher Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cuiPassport, setCuiPassport] = useState("");
  const [password, setPassword] = useState("Educa2026!");
  const [selectedLangIds, setSelectedLangIds] = useState<number[]>([]);

  // Existing Teacher Selector
  const [teacherId, setTeacherId] = useState(initialTeacherId ?? 0);

  // Course & Schedule Fields
  const [courseId, setCourseId] = useState(initialCourseId ?? 0);
  const [scheduleMode, setScheduleMode] = useState<"custom" | "preset">("custom");
  const [jornadaIndex, setJornadaIndex] = useState(0);
  const [selectedDays, setSelectedDays] = useState<number[]>([0]); // Default Monday
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [roomId, setRoomId] = useState(0);

  const [step, setStep] = useState(initialTeacherId ? 2 : 1);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const selectedTeacher = teachers.find((t) => t.id === teacherId);

  const slots =
    scheduleMode === "preset"
      ? JORNADA_PRESETS[jornadaIndex].slots
      : selectedDays.map((d) => ({
          day_of_week: d,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
        }));

  function toggleLang(id: number) {
    if (selectedLangIds.includes(id)) {
      setSelectedLangIds(selectedLangIds.filter((l) => l !== id));
    } else {
      setSelectedLangIds([...selectedLangIds, id]);
    }
  }

  function toggleDay(d: number) {
    if (selectedDays.includes(d)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((day) => day !== d));
      }
    } else {
      setSelectedDays([...selectedDays, d].sort((a, b) => a - b));
    }
  }

  async function submit(force = false) {
    setError(null);
    setWarnings([]);
    setIsSubmitting(true);

    try {
      let finalTeacherId = teacherId;

      if (teacherMode === "new") {
        const cuiVal = validateCuiPassport(cuiPassport);
        if (!cuiVal.isValid && cuiVal.error) {
          setError(cuiVal.error);
          setIsSubmitting(false);
          return;
        }

        const emailVal = validateEmailFormat(email);
        if (!emailVal.isValid && emailVal.error) {
          setError(emailVal.error);
          setIsSubmitting(false);
          return;
        }

        const nameVal = validateFullNameFormat(fullName);
        if (!nameVal.isValid && nameVal.error) {
          setError(nameVal.error);
          setIsSubmitting(false);
          return;
        }
        const created = await createUser.mutateAsync({
          role: "teacher",
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          cui_passport: cuiPassport.trim(),
          phone: phone.trim() || undefined,
          password: password || "Educa2026!",
        });
        finalTeacherId = created.id;

        if (selectedLangIds.length > 0) {
          await setLanguages.mutateAsync({
            teacherId: created.id,
            language_ids: selectedLangIds,
          });
        }
      }

      if (!finalTeacherId || !courseId) {
        setError("Debes seleccionar el profesor y el curso.");
        setIsSubmitting(false);
        return;
      }

      try {
        await assignCourseTeacher.mutateAsync({
          courseId,
          teacher_id: finalTeacherId,
        });
      } catch (e) {
        // Teacher might already be assigned to course
      }

      const conflictResults = await Promise.all(
        slots.map((s) =>
          checkConflict.mutateAsync({
            teacher_id: finalTeacherId,
            room_id: roomId || null,
            course_id: courseId,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
          }),
        ),
      );

      if (conflictResults.some((r) => r.conflicts.length > 0)) {
        setError("El profesor ya tiene una clase registrada en ese horario.");
        setIsSubmitting(false);
        return;
      }
      if (conflictResults.some((r) => r.room_conflicts.length > 0)) {
        setError("El aula ya está ocupada en ese horario.");
        setIsSubmitting(false);
        return;
      }

      const allWarnings = conflictResults.flatMap((r) => r.warnings);
      if (allWarnings.length > 0 && !force) {
        setWarnings(allWarnings);
        setIsSubmitting(false);
        return;
      }

      for (const s of slots) {
        await createSchedule.mutateAsync({
          course_id: courseId,
          teacher_id: finalTeacherId,
          room_id: roomId || null,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          force,
        });
      }

      notify(
        teacherMode === "new"
          ? `Profesor ${fullName} registrado y asignado al horario correctamente`
          : "Horario asignado al profesor con éxito",
        "success",
      );
      onClose();
    } catch (e) {
      setIsSubmitting(false);
      setError(apiErrorMessage(e, "Error al procesar asignación de horario"));
    }
  }

  const durationText = scheduleMode === "custom" ? calculateDurationText(startTime, endTime) : "";

  const stepsHeader = [
    { num: 1, label: "Datos Profesor", icon: "👨‍🏫" },
    { num: 2, label: "Curso y Horarios", icon: "📅" },
    { num: 3, label: "Confirmación", icon: "✨" },
  ];

  // One pinned action bar for all three steps: the button that moves you
  // forward is always in the same corner, and a long step can never scroll it
  // out of reach.
  const footer = (
    <ModalActions hint={`Paso ${step} de 3`}>
      {step === 1 && (
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={teacherMode === "new" ? !fullName.trim() || !email.trim() : !teacherId}
            onClick={() => setStep(2)}
          >
            Siguiente →
          </Button>
        </>
      )}
      {step === 2 && (
        <>
          {initialTeacherId ? (
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Atrás
            </Button>
          )}
          <Button disabled={!courseId} onClick={() => setStep(3)}>
            Siguiente →
          </Button>
        </>
      )}
      {step === 3 && (
        <>
          <Button variant="secondary" onClick={() => setStep(2)}>
            ← Atrás
          </Button>
          {warnings.length > 0 ? (
            <Button variant="danger" disabled={isSubmitting} onClick={() => submit(true)}>
              {isSubmitting ? "Procesando…" : "Crear de todos modos"}
            </Button>
          ) : (
            <Button disabled={isSubmitting} onClick={() => submit(false)}>
              {isSubmitting ? "Procesando…" : "Confirmar e impartir"}
            </Button>
          )}
        </>
      )}
    </ModalActions>
  );

  return (
    <Modal
      title="Asignar curso y horario"
      description="Elige al profesor, el curso que impartirá y la franja horaria."
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={footer}
    >
      <div className="space-y-5 text-xs">
        {/* Step Progress Tracker */}
        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-3">
          {stepsHeader.map((s) => {
            const active = step === s.num;
            const completed = step > s.num;
            return (
              <div
                key={s.num}
                className={`flex items-center gap-1.5 rounded-xl p-2 transition border ${
                  active
                    ? "border-brand-500 bg-brand-50/60 text-brand-900 font-semibold shadow-2xs"
                    : completed
                    ? "border-emerald-200 bg-emerald-50/50 text-emerald-800"
                    : "border-slate-100 bg-slate-50 text-slate-400"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    active
                      ? "bg-brand-600 text-white"
                      : completed
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {completed ? "✓" : s.num}
                </span>
                <span className="truncate text-[11px]">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* STEP 1: Teacher Info & Qualifications */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Segmented Mode Controller */}
            <div className="flex items-center justify-between rounded-xl bg-slate-100 p-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setTeacherMode("new")}
                className={`flex-1 rounded-lg py-2 font-medium transition text-center flex items-center justify-center gap-1.5 ${
                  teacherMode === "new"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🆕</span>
                <span>Nuevo Profesor (Crear Cuenta)</span>
              </button>
              <button
                type="button"
                onClick={() => setTeacherMode("existing")}
                className={`flex-1 rounded-lg py-2 font-medium transition text-center flex items-center justify-center gap-1.5 ${
                  teacherMode === "existing"
                    ? "bg-white text-slate-900 shadow-2xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>👤</span>
                <span>Profesor Ya Registrado</span>
              </button>
            </div>

            {teacherMode === "new" ? (
              <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="CUI / DPI o Pasaporte" required={true}>
                    <Input
                      placeholder="Ej. 2450 12345 0101"
                      value={cuiPassport}
                      onChange={(e) => setCuiPassport(formatCuiPassport(e.target.value))}
                    />
                  </Field>

                  <Field label="Nombre Completo" required={true}>
                    <Input
                      placeholder="Ej. Ana Patricia Morales"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </Field>

                  <Field label="Correo Electrónico" required={true}>
                    <Input
                      type="email"
                      placeholder="ana@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Teléfono / WhatsApp (opcional)">
                    <Input
                      placeholder="+502 5555-5555"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    />
                  </Field>

                  <Field label="Contraseña Inicial de Acceso" required={true}>
                    <Input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1.5">
                    Materias / Idiomas Cualificados
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {languages.map((l) => {
                      const checked = selectedLangIds.includes(l.id);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => toggleLang(l.id)}
                          className={`flex items-center gap-2 rounded-xl p-2.5 text-left border transition ${
                            checked
                              ? "border-brand-500 bg-brand-50/70 text-brand-900 font-semibold shadow-2xs"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked ? "bg-brand-600 border-brand-600 text-white" : "border-slate-300 bg-white"
                          }`}>
                            {checked && "✓"}
                          </span>
                          <span className="truncate">{l.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <Field label="Seleccionar Profesor Registrado">
                  <Select
                    value={teacherId}
                    onChange={(e) => setTeacherId(Number(e.target.value))}
                  >
                    <option value={0}>Selecciona un profesor…</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.email})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

          </div>
        )}

        {/* STEP 2: Course & Schedule Setup */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Pre-selected Teacher Info Banner */}
            {selectedTeacher && (
              <div className="flex items-center justify-between rounded-xl bg-brand-50/80 p-3 border border-brand-200 text-brand-950">
                <div className="flex items-center gap-2">
                  <span className="text-base">👤</span>
                  <div>
                    <span className="block text-[11px] text-brand-700">Profesor Seleccionado:</span>
                    <strong className="font-bold text-sm text-brand-900">{selectedTeacher.full_name}</strong>
                  </div>
                </div>
                {!initialTeacherId && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-[11px] text-brand-700 underline hover:text-brand-900"
                  >
                    Cambiar profesor
                  </button>
                )}
              </div>
            )}

            <Field label="Curso a Impartir (*)">
              <Select
                value={courseId}
                onChange={(e) => setCourseId(Number(e.target.value))}
              >
                <option value={0}>Selecciona un curso…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <label className="font-bold text-slate-800">Configuración de Horario</label>
                <div className="flex items-center gap-1 rounded-xl bg-slate-200/60 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("custom")}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      scheduleMode === "custom"
                        ? "bg-white text-slate-900 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Horario Libre
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("preset")}
                    className={`rounded-lg px-2.5 py-1 font-medium transition ${
                      scheduleMode === "preset"
                        ? "bg-white text-slate-900 shadow-2xs font-semibold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Plantillas
                  </button>
                </div>
              </div>

              {scheduleMode === "custom" ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1.5">Días de Impartición</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map((dName, idx) => {
                        const checked = selectedDays.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDay(idx)}
                            className={`rounded-xl px-3 py-1.5 font-medium transition ${
                              checked
                                ? "bg-brand-600 text-white shadow-2xs"
                                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {dName.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">Hora Inicio</label>
                      <TimePicker
                        className="!py-1"
                        value={startTime}
                        onChange={(val) => setStartTime(val)}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Hora Fin</label>
                      <TimePicker
                        className="!py-1"
                        value={endTime}
                        onChange={(val) => setEndTime(val)}
                      />
                    </div>
                  </div>

                  {durationText && (
                    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 border border-slate-200 font-mono text-[11px] text-slate-700 shadow-2xs">
                      <span>⏱️ Duración:</span>
                      <strong className="text-brand-700 font-semibold">{durationText}</strong>
                    </div>
                  )}
                </div>
              ) : (
                <Field label="Plantilla de Jornada Preconfigurada">
                  <Select
                    value={jornadaIndex}
                    onChange={(e) => setJornadaIndex(Number(e.target.value))}
                  >
                    <optgroup label="📅 Entre Semana (Lunes a Viernes · 1h/día)">
                      {JORNADA_PRESETS.map((p, i) =>
                        p.category === "semana" ? (
                          <option key={p.label} value={i}>
                            {p.label}
                          </option>
                        ) : null,
                      )}
                    </optgroup>
                    <optgroup label="☀️ Fin de Semana · Sábados (4h a 6h)">
                      {JORNADA_PRESETS.map((p, i) =>
                        p.category === "sabado" ? (
                          <option key={p.label} value={i}>
                            {p.label}
                          </option>
                        ) : null,
                      )}
                    </optgroup>
                    <optgroup label="🌙 Fin de Semana · Domingos (4h a 6h)">
                      {JORNADA_PRESETS.map((p, i) =>
                        p.category === "domingo" ? (
                          <option key={p.label} value={i}>
                            {p.label}
                          </option>
                        ) : null,
                      )}
                    </optgroup>
                  </Select>
                </Field>
              )}
            </div>

            <Field label="Aula Asignada (opcional)">
              <Select value={roomId} onChange={(e) => setRoomId(Number(e.target.value))}>
                <option value={0}>Virtual (Clase online)</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.is_virtual ? "(virtual)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

          </div>
        )}

        {/* STEP 3: Final Confirmation */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  Resumen de Asignación
                </h4>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Listo para Asignar
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-700">
                <div>
                  <span className="text-slate-500 block text-[11px]">Profesor:</span>
                  <strong className="text-slate-900 text-sm">
                    {teacherMode === "new" ? fullName : selectedTeacher?.full_name}
                  </strong>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Correo:</span>
                  <strong className="text-slate-900">{teacherMode === "new" ? email : selectedTeacher?.email}</strong>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-200/60">
                  <span className="text-slate-500 block text-[11px]">Curso Asignado:</span>
                  <strong className="text-brand-700 text-sm font-semibold">{selectedCourse?.name}</strong>
                </div>

                <div className="col-span-2 font-mono text-[11px] text-slate-700 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                  <span className="text-slate-500 block font-sans font-medium text-[11px]">Horario a registrar en el calendario:</span>
                  {slots.map((s, idx) => (
                    <div key={idx} className="font-semibold text-slate-800">
                      📅 {DAYS[s.day_of_week]} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-amber-50 p-3 text-amber-800 border border-amber-200">
                {error}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-amber-800 border border-amber-200">
                {warnings.join(" · ")}
              </div>
            )}

          </div>
        )}
      </div>
    </Modal>
  );
}
