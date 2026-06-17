export const SYSTEM_FILE_DIR = "_pub";
export const SYSTEM_FILE_PREFIX = `${SYSTEM_FILE_DIR}/`;
export const SYSTEM_API_FILE_PATH = `${SYSTEM_FILE_PREFIX}api.js`;
export const SYSTEM_API_MODULE_SPECIFIER = `./${SYSTEM_API_FILE_PATH}`;

export const PUB_SDK_SOURCE = `// pub.blue SDK \u2014 do not edit
export const command = (name, args, opts) => window.pub.command(name, args, opts);
export const cancelCommand = (id, reason) => window.pub.cancelCommand(id, reason);
export const commands = window.pub.commands;
`;

export const SYSTEM_FILES: Record<string, { content: string; mime: string }> = {
  [SYSTEM_API_FILE_PATH]: {
    content: PUB_SDK_SOURCE,
    mime: "text/javascript; charset=utf-8",
  },
};
