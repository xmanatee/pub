export type { CommandFunctionSpec } from "@shared/command-protocol-core";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
