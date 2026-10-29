export function latestSuccessfulUpdate(sources = [], details = []) {
  let latest = 0;
  for (const entry of [...sources, ...details]) {
    const value = entry.last_success;
    if (typeof value !== 'string') continue;
    const timestamp = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest ? new Date(latest) : null;
}
