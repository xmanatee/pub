export const MAX_FILE_SIZE = 300 * 1024;
export const MAX_FILES_PER_PUB = 50;
export const MAX_TOTAL_PUB_SIZE = 1.5 * 1024 * 1024;
export { SYSTEM_FILE_PREFIX } from "../../../../shared/pub-system-files-core";

export const EXCLUDED_DIRS = new Set([
  "_pub",
  "node_modules",
  "__pycache__",
  ".git",
  ".svn",
  ".hg",
]);

export const EXCLUDED_EXTENSIONS = new Set([".pyc", ".pyo", ".o", ".so", ".dylib", ".exe", ".dll"]);
