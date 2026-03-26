export function shouldSkipClaudePermissionsPrompt(): boolean {
  return process.getuid?.() !== 0;
}
