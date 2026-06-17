export const SYSTEM_FILE_PREFIX = "_pub/";

export const PUB_SDK_SOURCE = `// pub.blue SDK \u2014 do not edit
export const command = (name, args, opts) => window.pub.command(name, args, opts);
export const cancelCommand = (id, reason) => window.pub.cancelCommand(id, reason);
export const commands = window.pub.commands;
`;

export const SYSTEM_FILES: Record<string, { content: string; mime: string }> = {
  [`${SYSTEM_FILE_PREFIX}api.js`]: {
    content: PUB_SDK_SOURCE,
    mime: "text/javascript; charset=utf-8",
  },
};
