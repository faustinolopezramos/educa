import { useState } from "react";

import { Badge, Button, Card, Table, Td, Th } from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import { useAudit } from "../../lib/queries";
import type { AuditLog } from "../../lib/types";

const ENTITIES = [
  { id: "", label: "Todo" },
  { id: "grade", label: "Notas" },
  { id: "attendance", label: "Asistencia" },
  { id: "enrollment", label: "Matrículas" },
  { id: "location_proposal", label: "Ubicación" },
  { id: "user", label: "Usuarios" },
];

const ACTION_COLOR = {
  create: "green",
  update: "indigo",
  delete: "red",
} as const;

// The fields worth showing a before→after for, per entity. Keeps the diff
// readable instead of dumping every column.
const KEY_FIELDS: Record<string, string[]> = {
  grade: ["score", "evaluation_name"],
  attendance: ["status"],
  enrollment: ["status", "payment_status"],
  location_proposal: ["status"],
  user: ["role", "email", "full_name"],
};

function diff(row: AuditLog): string {
  const fields = KEY_FIELDS[row.entity] ?? [];
  const parts: string[] = [];
  for (const f of fields) {
    const b = row.before?.[f];
    const a = row.after?.[f];
    if (row.action === "create" && a !== undefined) parts.push(`${f}: ${fmt(a)}`);
    else if (row.action === "delete" && b !== undefined) parts.push(`${f}: ${fmt(b)}`);
    else if (b !== a) parts.push(`${f}: ${fmt(b)} → ${fmt(a)}`);
  }
  return parts.join(" · ") || "—";
}

function fmt(v: unknown): string {
  return v === null || v === undefined ? "∅" : String(v);
}

const PAGE_SIZE = 100;

/** Read-only view of the change trail. Admin-only (route gate + API gate). */
export function AuditPanel() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const { data, isLoading } = useAudit(
    entity ? { entity, offset: page * PAGE_SIZE, limit: PAGE_SIZE } : { offset: page * PAGE_SIZE, limit: PAGE_SIZE },
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function switchEntity(e: string) {
    setEntity(e);
    setPage(0);
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Registro de cambios</h3>
        <div className="ml-auto flex gap-1">
          {ENTITIES.map((e) => (
            <button
              key={e.id}
              onClick={() => switchEntity(e.id)}
              className={`rounded-md px-2 py-1 text-xs ${
                entity === e.id
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin cambios registrados.</p>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Cuándo</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>Cambio</Th>
                <Th>Actor</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDateTime(r.at)}</Td>
                  <Td>
                    <Badge color={ACTION_COLOR[r.action]}>{r.action}</Badge>
                  </Td>
                  <Td>
                    {r.entity} #{r.entity_id}
                  </Td>
                  <Td>{diff(r)}</Td>
                  <Td>{r.actor_id ? `#${r.actor_id}` : "sistema"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>{total} registros</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Anterior
                </Button>
                <span className="self-center">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  className="text-xs"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
