import { useState } from "react";

import { Button, Input, Modal } from "./ui";

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
    <Modal title={title} onClose={onClose} maxWidth="max-w-sm">
      <div className="space-y-4">
        {label && <label className="block text-sm text-slate-600">{label}</label>}
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/25"
          />
        ) : (
          <Input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) onSubmit(value.trim());
            }}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={confirmVariant}
            disabled={disabled}
            onClick={() => onSubmit(value.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
