export function format(template: string, vars?: Record<string, string | number>): string {
  return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : template;
}
