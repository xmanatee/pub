export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === "string" && error.trim().length > 0) return error;
  return fallback;
}

export function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message.trim().length > 0) return error;
  return new Error(getErrorMessage(error, fallback));
}
