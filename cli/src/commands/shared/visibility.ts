export function formatVisibility(isPublic: boolean): string {
  return isPublic ? "public" : "private";
}

export function resolveVisibilityFlags(opts: {
  public?: boolean;
  private?: boolean;
  commandName: string;
}): boolean | undefined {
  if (opts.public && opts.private) {
    throw new Error(`Use only one of --public or --private for ${opts.commandName}.`);
  }
  if (opts.public) return true;
  if (opts.private) return false;
  return undefined;
}
