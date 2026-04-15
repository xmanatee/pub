import type { HnStory } from "../results";

const HN = "https://hacker-news.firebaseio.com/v0";

interface RawStory {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  descendants?: number;
  time?: number;
}

export async function hn(params: { count?: number } = {}): Promise<{ stories: HnStory[] }> {
  const count = Math.min(params.count ?? 12, 30);
  const idsRes = await fetch(`${HN}/topstories.json`);
  if (!idsRes.ok) throw new Error(`HN topstories returned ${idsRes.status}`);
  const ids = (await idsRes.json()) as number[];
  const items = await Promise.all(
    ids.slice(0, count).map(async (id) => {
      const r = await fetch(`${HN}/item/${id}.json`);
      return r.ok ? ((await r.json()) as RawStory) : null;
    }),
  );
  const stories: HnStory[] = items
    .filter((i): i is RawStory => Boolean(i?.title))
    .map((i) => ({
      id: i.id,
      title: i.title ?? "",
      url: i.url ?? null,
      score: i.score ?? 0,
      by: i.by ?? "",
      comments: i.descendants ?? 0,
      time: i.time ?? 0,
    }));
  return { stories };
}
