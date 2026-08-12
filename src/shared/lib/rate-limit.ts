const RATE_LIMIT_PATTERNS = [
  /429/i,
  /too many requests/i,
  /sign in to confirm/i,
  /not a bot/i,
  /bot/i,
];

export function isRateLimitError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(msg));
}
