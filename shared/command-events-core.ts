export const COMMAND_INVOKE_EVENT = "command.invoke";
export const COMMAND_RESULT_EVENT = "command.result";
export const COMMAND_CANCEL_EVENT = "command.cancel";

export type CommandEvent =
  | typeof COMMAND_INVOKE_EVENT
  | typeof COMMAND_RESULT_EVENT
  | typeof COMMAND_CANCEL_EVENT;
