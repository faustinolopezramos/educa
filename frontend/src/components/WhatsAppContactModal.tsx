import { useState } from "react";
import { Button, Field, Modal, ModalActions } from "./ui";
import {
  buildWhatsAppUrl,
  cleanPhoneForWhatsApp,
  WHATSAPP_TEMPLATES,
} from "../lib/whatsapp";

export interface WhatsAppContactModalProps {
  student: {
    id: number;
    full_name: string;
    phone?: string | null;
  };
  courseName?: string;
  balance?: number;
  currency?: string;
  onClose: () => void;
}

export function WhatsAppContactModal({
  student,
  courseName,
  balance,
  currency = "Q",
  onClose,
}: WhatsAppContactModalProps) {
  const academyName = "la academia";

  const defaultTemplate =
    balance && balance > 0
      ? WHATSAPP_TEMPLATES.find((t) => t.id === "payment_reminder") ?? WHATSAPP_TEMPLATES[0]
      : WHATSAPP_TEMPLATES.find((t) => t.id === "welcome") ?? WHATSAPP_TEMPLATES[0];

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(defaultTemplate.id);
  const [message, setMessage] = useState<string>(() =>
    defaultTemplate.buildText({
      studentName: student.full_name,
      courseName,
      balance,
      currency,
      academyName,
    }),
  );

  const cleanedPhone = cleanPhoneForWhatsApp(student.phone);
  const hasPhone = Boolean(cleanedPhone);

  function handleSelectTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const tmpl = WHATSAPP_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setMessage(
        tmpl.buildText({
          studentName: student.full_name,
          courseName,
          balance,
          currency,
          academyName,
        }),
      );
    }
  }

  function handleOpenWhatsApp() {
    if (!hasPhone) return;
    const url = buildWhatsAppUrl(student.phone, message);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Modal
      title={`Contactar por WhatsApp · ${student.full_name}`}
      description={
        hasPhone
          ? `Número registrado: ${student.phone} (se enviará a +${cleanedPhone})`
          : "Este alumno no tiene un número telefónico registrado."
      }
      onClose={onClose}
      footer={
        <ModalActions>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleOpenWhatsApp}
            disabled={!hasPhone || !message.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Abrir chat de WhatsApp →
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        {!hasPhone ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Sin teléfono registrado</p>
            <p className="mt-1 text-xs text-amber-700">
              Para enviar mensajes por WhatsApp, edita la ficha del alumno y agrega su número de
              teléfono celular con código de área.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Seleccionar plantilla rápida
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {WHATSAPP_TEMPLATES.map((tmpl) => {
                  const isSelected = tmpl.id === selectedTemplateId;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl.id)}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? "border-brand-500 bg-brand-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900">{tmpl.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-2xs text-slate-500">
                        {tmpl.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Mensaje a enviar" hint="Puedes editar el texto antes de abrir el chat.">
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Escribe el mensaje..."
              />
            </Field>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">💡 Tip de mostrador:</span> Al hacer
              clic en abrir chat, se abrirá WhatsApp Web o la app de escritorio en una pestaña
              nueva con el mensaje listo para enviar con 1 tecla.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
