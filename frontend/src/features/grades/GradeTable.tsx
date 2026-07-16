import { useMemo, useState } from "react";

import { Button, Card, Input } from "../../components/ui";
import {
  useCreateGrade,
  useGrades,
  useUpdateGrade,
} from "../../lib/queries";
import type { Enrollment, Grade, UserBrief } from "../../lib/types";

// Must match the bounds the API enforces in backend/app/schemas/grade.py.
const SCORE_MIN = 0;
const SCORE_MAX = 10;

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

  const enrollmentIds = useMemo(
    () => new Set(enrollments.map((e) => e.id)),
    [enrollments],
  );
  const grades = useMemo(
    () => allGrades.filter((g) => enrollmentIds.has(g.enrollment_id)),
    [allGrades, enrollmentIds],
  );

  // Evaluation columns = existing names ∪ locally-added ones.
  const columns = useMemo(() => {
    const names = new Set<string>(grades.map((g) => g.evaluation_name));
    extraColumns.forEach((c) => names.add(c));
    return [...names];
  }, [grades, extraColumns]);

  function addColumn() {
    const name = window.prompt("Nombre de la evaluación (ej. Examen Unidad 2)");
    if (name && !columns.includes(name)) setExtraColumns((c) => [...c, name]);
  }

  if (enrollments.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-400">No hay alumnos matriculados.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Calificaciones</h3>
        <Button variant="secondary" className="text-xs" onClick={addColumn}>
          + Evaluación
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate-500">
                Alumno
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-medium text-slate-500"
                >
                  {col}
                </th>
              ))}
              {columns.length === 0 && (
                <th className="px-3 py-2 text-left text-xs text-slate-300">
                  Añade una evaluación →
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2 text-slate-700">
                  {students.find((s) => s.id === e.student_id)?.full_name ??
                    `#${e.student_id}`}
                </td>
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Escala {SCORE_MIN}–{SCORE_MAX}. Los cambios se guardan automáticamente al salir
        de la celda.
      </p>
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
        onBlur={commit}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
