export function exitProcess(code: number): Promise<never> {
  process.exit(code);
}
