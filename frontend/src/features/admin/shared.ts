import { notify } from "../../lib/toast";
import { apiErrorMessage } from "../../lib/api";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 8;

export function onMutationError(fallback: string) {
  return (e: unknown) => notify(apiErrorMessage(e, fallback), "error");
}
