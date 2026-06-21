/**
 * Skill variable substitution (PLAN §19). Replaces {{name}} placeholders with
 * provided values; unknown placeholders are left untouched.
 */
export function substituteVars(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}
