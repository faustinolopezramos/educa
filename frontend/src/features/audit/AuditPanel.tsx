import { useState } from "react";

import {
  Badge, Button, Card, EmptyState, PageHeader, SegmentedControl, SkeletonRows, Table, Td, Th,
} from "../../components/ui";
import { IconShield } from "../../components/icons";
import { formatDateTime } from "../../lib/format";
import { useAudit } from "../../lib/queries";
import type { AuditLog } from "../../lib/types";

const ENTITIES = [
  { value: "", label: "Todo" },
  { value: "grade", label: "Notas" },
  { value: "attendance", label: "Asistencia" },
  { value: "enrollment", label: "Matrículas" },
  { value: "location_proposal", label: "Ubicación" },
  { value: "user", label: "Usuarios" },
];

const ACTION_LABELS: Record<string, string> = {
  create: "Creación",
  update: "Cambio",
  delete: "Borrado",
};

const ENTITY_LABELS: Record<string, string> = {
  grade: "Nota",
  attendance: "Asistencia",
  enrollment: "Matrícula",
  location_proposal: "Ubicación",
  user: "Usuario",
};

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
    <div>
      <PageHeader
        title="Auditoría"
        description="Quién cambió qué y cuándo. Solo lectura."
      />

      <div className="mb-4">
        <SegmentedControl value={entity} onChange={switchEntity} options={ENTITIES} />
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<IconShield className="h-5 w-5" />}
          title="Sin cambios registrados"
          message="Cuando alguien edite notas, asistencia o matrículas, el movimiento aparecerá aquí."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>Cambio</Th>
                <Th align="right">Autor</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <span className="tabular whitespace-nowrap text-xs text-slate-600">
                      {formatDateTime(r.at)}
                    </span>
                  </Td>
                  <Td>
                    <Badge color={ACTION_COLOR[r.action]}>
                      {ACTION_LABELS[r.action] ?? r.action}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="text-slate-800">{ENTITY_LABELS[r.entity] ?? r.entity}</span>{" "}
                    <span className="font-mono text-xs text-slate-400">#{r.entity_id}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-700">{diff(r)}</span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-xs text-slate-500">
                      {r.actor_id ? `#${r.actor_id}` : "sistema"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5">
              <span className="text-xs text-slate-500">
                {total} registros · página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
