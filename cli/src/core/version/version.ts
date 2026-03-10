import packageJson from "../../../package.json";

const version = packageJson.version;
if (typeof version !== "string" || version.length === 0) {
  throw new Error("Invalid CLI version in package.json");
}

export const CLI_VERSION = version;
