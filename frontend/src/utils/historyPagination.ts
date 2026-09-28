import type { Meeting } from "../types";

export async function loadAllHistory(
  loadPage: (offset: number, limit: number) => Promise<Meeting[]>,
  pageSize = 100,
): Promise<Meeting[]> {
  const result: Meeting[] = [];
  let offset = 0;
  while (true) {
    const page = await loadPage(offset, pageSize);
    result.push(...page);
    if (page.length < pageSize) return result;
    offset += page.length;
  }
}
