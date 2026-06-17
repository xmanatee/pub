import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export { getErrorMessage, toError } from "@shared/error-core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
