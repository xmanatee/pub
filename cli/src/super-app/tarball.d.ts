/**
 * Asset imports resolved by bun-compile (`with { type: "file" }`) and by the
 * vitest `fileAsset` plugin to an absolute path string at runtime.
 */
declare module "*.tar.gz" {
  const path: string;
  export default path;
}
