/** Spread work across sources so one busy RSS feed cannot starve the rest. */
export function pickRoundRobinByKey<T>(items: T[], limit: number, keyOf: (item: T) => string): T[] {
  if (limit <= 0 || !items.length) return [];
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item) || '_';
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  const queues = [...buckets.values()];
  const picked: T[] = [];
  let index = 0;
  while (picked.length < limit) {
    let added = false;
    for (const queue of queues) {
      const item = queue[index];
      if (!item) continue;
      picked.push(item);
      added = true;
      if (picked.length >= limit) return picked;
    }
    if (!added) break;
    index += 1;
  }
  return picked;
}
