const TOKEN_PATTERN = /\[(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export function parseCorrelationToken(subject: string): { legId: number; permitRequestId: string } | null {
  const match = subject.match(TOKEN_PATTERN);
  if (!match) return null;
  return { legId: Number(match[1]), permitRequestId: match[2] };
}
