let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/** Bijective base-26: A..Z, AA..AZ, BA.. — the spreadsheet column sequence. */
function labelAt(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * First label not already in use. Gaps left by deleted walls are refilled, but an
 * existing wall's label is never reassigned — labels are how the plan page and the
 * elevation pages cross-reference each other.
 */
export function nextWallLabel(existing: string[]): string {
  const taken = new Set(existing);
  for (let i = 0; ; i += 1) {
    const candidate = labelAt(i);
    if (!taken.has(candidate)) return candidate;
  }
}
