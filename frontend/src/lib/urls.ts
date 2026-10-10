/**
 * Safe URL validation and sanitization for links and redirects.
 * Blocks dangerous schemes (javascript:, data:, vbscript:, file:).
 * Only permits valid http:, https:, or application relative URLs.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return undefined;
  }

  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("/")
  ) {
    return trimmed;
  }

  return undefined;
}
