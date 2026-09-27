import { useRef, useState } from "react";
import { Badge, Button, Field, Input, Modal, ModalActions, Select, Table, Td, Th } from "../../components/ui";
import { api, apiErrorMessage } from "../../lib/api";
import { notify } from "../../lib/toast";
import { useCourses } from "../../lib/queries";
import type { BulkImportResponse, StudentImportRow } from "../../lib/types";

interface StudentBulkImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function StudentBulkImportModal({ onClose, onSuccess }: StudentBulkImportModalProps) {
  const { data: courses = [] } = useCourses();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "results">("upload");
  const [selectedCourseId, setSelectedCourseId] = useState<number | "none">("none");
  const [defaultPassword, setDefaultPassword] = useState("Educa2026!");
  const [fileName, setFileName] = useState<string>("");
  const [parsedStudents, setParsedStudents] = useState<StudentImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResponse, setImportResponse] = useState<BulkImportResponse | null>(null);

  function downloadCsvTemplate() {
    const csvContent =
      "Nombre Completo,Correo Electronico,Documento / CUI,Telefono,Direccion\n" +
      "Carlos Alberto Mendez,carlos.mendez@example.com,2984719280101,+502 5555-1234,Ciudad de Guatemala\n" +
      "Maria Jose Fernandez,maria.fernandez@example.com,3012984720101,+502 5555-5678,Antigua Guatemala\n" +
      "Alejandro Morales,alejandro.m@example.com,2489102930101,+502 5555-9012,Quetzaltenango\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "plantilla_alumnos_educa.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function parseCsvContent(text: string) {
    const lines = text
      .split(/\r\n|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setParseErrors(["El archivo está vacío o solo contiene la fila de encabezados."]);
      return;
    }

    // Determine delimiter (, or ;)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

    const headers = firstLine
      .split(delimiter)
      .map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

    // Map column indices
    const nameIdx = headers.findIndex((h) => h.includes("nombre") || h.includes("name"));
    const emailIdx = headers.findIndex((h) => h.includes("correo") || h.includes("email"));
    const cuiIdx = headers.findIndex(
      (h) => h.includes("cui") || h.includes("dpi") || h.includes("doc") || h.includes("pasaporte") || h.includes("identifica")
    );
    const phoneIdx = headers.findIndex((h) => h.includes("tel") || h.includes("cel") || h.includes("phone"));
    const addressIdx = headers.findIndex((h) => h.includes("direc") || h.includes("address") || h.includes("ciudad"));

    if (nameIdx === -1 || emailIdx === -1) {
      setParseErrors([
        "No se encontraron las columnas requeridas 'Nombre Completo' y 'Correo Electronico'. Descarga la plantilla modelo.",
      ]);
      return;
    }

    const students: StudentImportRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV split respecting quotes
      const values = line.split(delimiter).map((v) => v.replace(/^["']|["']$/g, "").trim());

      const full_name = values[nameIdx] || "";
      const email = values[emailIdx] || "";
      const cui_passport = cuiIdx !== -1 && values[cuiIdx] ? values[cuiIdx] : null;
      const phone = phoneIdx !== -1 && values[phoneIdx] ? values[phoneIdx] : null;
      const address = addressIdx !== -1 && values[addressIdx] ? values[addressIdx] : null;

      if (!full_name && !email) continue;

      if (!full_name) {
        errors.push(`Fila ${i + 1}: Falta el nombre del alumno.`);
        continue;
      }
      if (!email || !email.includes("@")) {
        errors.push(`Fila ${i + 1}: El correo '${email}' no es válido.`);
        continue;
      }

      students.push({
        full_name,
        email,
        cui_passport,
        phone,
        address,
      });
    }

    setParseErrors(errors);
    setParsedStudents(students);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setParseErrors([]);
    setParsedStudents([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        parseCsvContent(text);
      }
    };
    reader.readAsText(file);
  }

  async function handleImportSubmit() {
    if (parsedStudents.length === 0) {
      notify("No hay alumnos válidos para importar", "error");
      return;
    }

    setImporting(true);
    try {
      const res = await api.post<BulkImportResponse>("/users/bulk-import", {
        students: parsedStudents,
        default_course_id: selectedCourseId !== "none" ? selectedCourseId : null,
        default_password: defaultPassword.trim() || "Educa2026!",
      });

      setImportResponse(res.data);
      setStep("results");
      notify(
        `Importación finalizada: ${res.data.created_count} creados, ${res.data.enrolled_count} matriculados.`,
        "success"
      );
      onSuccess();
    } catch (err) {
      notify(apiErrorMessage(err, "Error al importar alumnos"), "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      title="Carga Masiva de Alumnos (CSV / Excel)"
      description={
        step === "upload"
          ? "Importa decenas o cientos de estudiantes en un solo paso y asígnalos a su curso."
          : "Resumen detallado de la importación masiva procesada."
      }
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {step === "results" ? "Cerrar" : "Cancelar"}
          </Button>

          {step === "upload" && (
            <Button
              type="button"
              onClick={handleImportSubmit}
              disabled={importing || parsedStudents.length === 0}
            >
              {importing
                ? "Procesando importación…"
                : `Importar ${parsedStudents.length} Alumno${parsedStudents.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </ModalActions>
      }
    >
      {step === "upload" ? (
        <div className="space-y-4">
          {/* Action to download CSV template */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <div className="text-xs font-semibold text-slate-800">
                ¿No tienes el formato adecuado?
              </div>
              <div className="text-2xs text-slate-500">
                Descarga la plantilla con las columnas exactas listas para Excel o Google Sheets.
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={downloadCsvTemplate}>
              📄 Descargar plantilla CSV
            </Button>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          {/* Drag & Drop Area */}
          <div
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? "border-brand-500 bg-brand-50/60 scale-[1.01]"
                : "border-slate-300 hover:border-brand-400 hover:bg-slate-50"
            }`}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 font-bold">
              📥
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-800">
              {fileName ? `Archivo: ${fileName}` : "Arrastra tu archivo CSV aquí o haz clic para examinar"}
            </p>
            <p className="mt-0.5 text-2xs text-slate-400">
              Archivos .csv o .txt delimitados por coma o punto y coma
            </p>
          </div>

          {/* Configuration Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <Field label="Matricular automáticamente en curso (opcional)">
              <Select
                value={selectedCourseId}
                onChange={(e) =>
                  setSelectedCourseId(e.target.value === "none" ? "none" : Number(e.target.value))
                }
              >
                <option value="none">-- Solo dar de alta (sin matricular) --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Contraseña provisional para nuevos accesos">
              <Input
                value={defaultPassword}
                onChange={(e) => setDefaultPassword(e.target.value)}
                placeholder="Educa2026!"
              />
            </Field>
          </div>

          {/* Parse warnings/errors */}
          {parseErrors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <div className="font-bold">Avisos del archivo:</div>
              <ul className="list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto">
                {parseErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Live Preview Table */}
          {parsedStudents.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Vista Previa ({parsedStudents.length} alumnos detectados):
                </span>
                <span className="text-2xs text-slate-500">Mostrando primeros 5 registros</span>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                <Table>
                  <thead>
                    <tr>
                      <Th>Nombre</Th>
                      <Th>Correo</Th>
                      <Th>Documento / CUI</Th>
                      <Th>Teléfono</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {parsedStudents.slice(0, 5).map((st, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <Td><span className="font-semibold text-slate-900">{st.full_name}</span></Td>
                        <Td><span className="text-slate-600">{st.email}</span></Td>
                        <Td><span className="text-slate-500">{st.cui_passport || "—"}</span></Td>
                        <Td><span className="text-slate-500">{st.phone || "—"}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* STEP 2: RESULTS SUMMARY */
        <div className="space-y-4">
          {importResponse && (
            <>
              {/* Metric summary badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                  <div className="text-2xs text-slate-500 font-semibold uppercase">Total Leídos</div>
                  <div className="text-lg font-bold text-slate-900">{importResponse.total_processed}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 text-center">
                  <div className="text-2xs text-emerald-800 font-semibold uppercase">Creados</div>
                  <div className="text-lg font-bold text-emerald-900">{importResponse.created_count}</div>
                </div>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 text-center">
                  <div className="text-2xs text-indigo-800 font-semibold uppercase">Matriculados</div>
                  <div className="text-lg font-bold text-indigo-900">{importResponse.enrolled_count}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-center">
                  <div className="text-2xs text-amber-800 font-semibold uppercase">Omitidos / Error</div>
                  <div className="text-lg font-bold text-amber-900">
                    {importResponse.skipped_count + importResponse.error_count}
                  </div>
                </div>
              </div>

              {/* Detailed Results List */}
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                <Table>
                  <thead>
                    <tr>
                      <Th>Fila</Th>
                      <Th>Estudiante</Th>
                      <Th>Estado</Th>
                      <Th>Detalle</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {importResponse.results.map((r) => (
                      <tr key={r.row_number} className="hover:bg-slate-50">
                        <Td><span className="font-mono text-slate-500">#{r.row_number}</span></Td>
                        <Td>
                          <div className="font-semibold text-slate-900">{r.full_name}</div>
                          <div className="text-2xs text-slate-500">{r.email}</div>
                        </Td>
                        <Td>
                          {r.status === "created" ? (
                            <Badge color="green">Creado</Badge>
                          ) : r.status === "skipped" ? (
                            <Badge color="slate">Omitido</Badge>
                          ) : (
                            <Badge color="red">Error</Badge>
                          )}
                        </Td>
                        <Td><span className="text-slate-600 text-2xs">{r.message}</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
