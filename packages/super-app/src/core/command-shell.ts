import type { CommandShellSpec } from "~/core/types";

export function strictShell(script: string): CommandShellSpec {
  return {
    kind: "shell",
    shell: "/bin/bash",
    script: `set -euo pipefail; ${script}`,
  };
}
