/**
 * Turns unknown thrown/rejected values into a safe string.
 * Avoids "[object Event]" when a DOM Event is used as a rejection reason.
 */
export function toErrorMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message || reason.name || "Error";
  }
  if (typeof reason === "string") return reason;
  if (typeof reason === "number" || typeof reason === "boolean") {
    return String(reason);
  }
  if (typeof Event !== "undefined" && reason instanceof Event) {
    const re = reason as ErrorEvent;
    if (typeof re.message === "string" && re.message.length > 0) {
      return re.message;
    }
    return `Unexpected browser event (${reason.type})`;
  }
  if (reason && typeof reason === "object") {
    const msg = (reason as { message?: unknown }).message;
    if (typeof msg === "string" && msg.length > 0) return msg;
    const detail = (reason as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return "Something went wrong";
}

export function rethrowAsError(reason: unknown): never {
  throw reason instanceof Error
    ? reason
    : new Error(toErrorMessage(reason));
}
