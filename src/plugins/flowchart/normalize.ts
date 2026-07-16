export function normalizeFlowchartSource(code: string): string {
  const source = code.trim();
  return /^(flowchart|graph)\s+/i.test(source)
    ? source
    : `flowchart TD\n${source}`;
}
