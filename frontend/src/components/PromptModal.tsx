import { useState } from "react";

import { Button, Input, Modal, ModalActions } from "./ui";

/**
 * In-product replacement for `window.prompt()`. Collects a single reason/text
 * with proper styling, keyboard support and a clear primary action.
 */
export function PromptModal({
  title,
  label,
  placeholder,
  confirmLabel = "Confirmar",
  confirmVariant = "primary",
  required = false,
  multiline = false,
  busy = false,
  onSubmit,
  onClose,
}: {
  title: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  required?: boolean;
  multiline?: boolean;
  busy?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const disabled = busy || (required && !value.trim());

  return (
    <Modal
      title={title}
      onClose={onClose}
      maxWidth="max-w-sm"
      onSubmit={() => {
        if (!disabled) onSubmit(value.trim());
      }}
      footer={
        <ModalActions hint={multiline ? undefined : "Enter para confirmar"}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant={confirmVariant} disabled={disabled}>
            {busy ? "Enviando…" : confirmLabel}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-3">
        {label && <label className="block text-sm text-slate-600">{label}</label>}
        {multiline ? (
          <textarea
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/25"
          />
        ) : (
          <Input
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
