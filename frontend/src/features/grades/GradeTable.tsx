import { useEffect, useMemo, useRef, useState } from "react";

import { PromptModal } from "../../components/PromptModal";
import { Button, Card, EmptyState, Input, SectionHeading } from "../../components/ui";
import {
  useCreateGrade,
  useGrades,
  useUpdateGrade,
} from "../../lib/queries";
import { SCORE_MAX, SCORE_MIN } from "../../lib/constants";
import type { Enrollment, Grade, UserBrief } from "../../lib/types";

interface Props {
  enrollments: Enrollment[];
  students: UserBrief[];
}

/**
 * Inline grade sheet: rows = students, columns = evaluations.
 * Editing a cell autosaves (create or patch) on blur.
 */
export function GradeTable({ enrollments, students }: Props) {
  const { data: allGrades = [] } = useGrades();
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const enrollmentIds = useMemo(
    () => new Set(enrollments.map((e) => e.id)),
    [enrollments],
  );
  // Course-level evaluations only (exams/finals). Per-session grades live in
  // the class-session panel, keyed by day, not in this exam gradebook.
  const grades = useMemo(
    () =>
      allGrades.filter(
        (g) => enrollmentIds.has(g.enrollment_id) && g.session_id === null,
      ),
    [allGrades, enrollmentIds],
  );

  // Evaluation columns = existing names ∪ locally-added ones.
  const columns = useMemo(() => {
    const names = new Set<string>(grades.map((g) => g.evaluation_name));
    extraColumns.forEach((c) => names.add(c));
    return [...names];
  }, [grades, extraColumns]);

  const studentAverages = useMemo(() => {
    const map = new Map<number, { avg: number | null; count: number }>();
    for (const e of enrollments) {
      const studentGrades = grades.filter((g) => g.enrollment_id === e.id);
      if (studentGrades.length === 0) {
        map.set(e.id, { avg: null, count: 0 });
      } else {
        const sum = studentGrades.reduce((acc, curr) => acc + curr.score, 0);
        map.set(e.id, {
          avg: Math.round((sum / studentGrades.length) * 10) / 10,
          count: studentGrades.length,
        });
      }
    }
    return map;
  }, [enrollments, grades]);

  const filteredEnrollments = useMemo(() => {
    if (!search.trim()) return enrollments;
    return enrollments.filter((e) => {
      const name = (
        students.find((s) => s.id === e.student_id)?.full_name ?? `#${e.student_id}`
      ).toLowerCase();
      return name.includes(search.trim().toLowerCase());
    });
  }, [enrollments, students, search]);

  function addColumn(name: string) {
    if (name && !columns.includes(name)) setExtraColumns((c) => [...c, name]);
    setAdding(false);
  }

  if (enrollments.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="◎"
          title="Sin alumnos matriculados"
          message="Cuando haya alumnos en este curso podrás registrar sus exámenes aquí."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionHeading className="mb-0">Calificaciones de Exámenes</SectionHeading>
          <div className="relative min-w-[12rem]">
            <Input
              placeholder="Filtrar por alumno…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs py-1"
            />
          </div>
        </div>
        <Button variant="secondary" className="text-xs" onClick={() => setAdding(true)}>
          + Nueva Evaluación
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                Alumno
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200"
                >
                  {col}
                </th>
              ))}
              {columns.length === 0 && (
                <th className="px-3 py-2 text-left text-xs text-slate-300 border-b border-slate-200">
                  Añade una evaluación →
                </th>
              )}
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b border-slate-200 border-l border-slate-100">
                Promedio
              </th>
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b border-slate-200">
                Condición
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredEnrollments.map((e) => {
              const avgData = studentAverages.get(e.id);
              const avg = avgData?.avg;
              const isPassing = avg != null ? avg >= 6.0 : null;

              return (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="sticky left-0 bg-white px-3 py-2 text-slate-900 font-medium border-b border-slate-100">
                    {students.find((s) => s.id === e.student_id)?.full_name ??
                      `#${e.student_id}`}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-2 py-1 border-b border-slate-100">
                      <GradeCell
                        enrollmentId={e.id}
                        evaluation={col}
                        grade={grades.find(
                          (g) =>
                            g.enrollment_id === e.id && g.evaluation_name === col,
                        )}
                      />
                    </td>
                  ))}
                  {columns.length === 0 && <td className="border-b border-slate-100" />}
                  <td className="px-3 py-2 text-center font-bold text-slate-900 tabular border-b border-slate-100 border-l border-slate-100">
                    {avg != null ? avg.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center border-b border-slate-100">
                    {avg == null ? (
                      <span className="text-2xs text-slate-400">Sin notas</span>
                    ) : isPassing ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-700 border border-emerald-200">
                        Aprobando
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-2xs font-bold text-red-700 border border-red-200">
                        En riesgo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Escala {SCORE_MIN}–{SCORE_MAX}. Aprobación mínima: 6.0. Los cambios se guardan automáticamente al salir
        de la celda.
      </p>
      {adding && (
        <PromptModal
          title="Nueva evaluación"
          label="Nombre de la evaluación"
          placeholder="Ej. Examen Unidad 2"
          confirmLabel="Añadir"
          required
          onClose={() => setAdding(false)}
          onSubmit={addColumn}
        />
      )}
    </Card>
  );
}

function GradeCell({
  enrollmentId,
  evaluation,
  grade,
}: {
  enrollmentId: number;
  evaluation: string;
  grade?: Grade;
}) {
  const create = useCreateGrade();
  const update = useUpdateGrade();
  const [value, setValue] = useState(grade ? String(grade.score) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  // Resyncs with the server value after an invalidation (e.g. someone else's
  // edit, or the real value replacing our optimistic one) — but not while the
  // user is actively typing in this cell.
  useEffect(() => {
    if (focused.current) return;
    setValue(grade ? String(grade.score) : "");
  }, [grade?.score]);

  function commit() {
    const trimmed = value.trim();
    setError(null);
    if (trimmed === "") return;
    const score = Number(trimmed);
    if (Number.isNaN(score)) {
      setError("Debe ser un número");
      return;
    }
    // Mirrors the 0–10 bound the API enforces, so a typo is caught here rather
    // than coming back as an opaque 422.
    if (score < SCORE_MIN || score > SCORE_MAX) {
      setError(`Debe estar entre ${SCORE_MIN} y ${SCORE_MAX}`);
      return;
    }
    if (grade) {
      if (score === grade.score) return;
      update.mutate({ id: grade.id, score });
    } else {
      create.mutate({ enrollment_id: enrollmentId, evaluation_name: evaluation, score });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="relative">
      <Input
        className={`w-20 ${error ? "border-red-400" : saved ? "border-green-400" : ""}`}
        inputMode="decimal"
        placeholder="—"
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
