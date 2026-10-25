/** Six slides fit within reach; pages expose the entire collected cast. */
export function castPage(cast: readonly string[], requested = 0): { ids: string[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(cast.length / 6));
  const page = ((requested % pages) + pages) % pages;
  return { ids: [...cast].reverse().slice(page * 6, page * 6 + 6), page, pages };
}
