import type { Page } from '@iskcon/contracts';

const PAGE_SIZE = 200;

/** Reads every page of a listing. */
export async function readAllPages<T>(fetch: (page: number, pageSize: number) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await fetch(page, PAGE_SIZE);
    all.push(...result.items);
    if (all.length >= result.total || result.items.length === 0) return all;
  }
}
