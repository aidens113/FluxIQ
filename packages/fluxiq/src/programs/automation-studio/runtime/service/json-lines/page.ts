import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// One page of a JSON-lines file, read without holding the whole file.

export async function readJsonLinePage<T>(filePath: string, offset: number, limit: number): Promise<T[]> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const items: T[] = [];
  let index = 0;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (index >= offset && items.length < limit) items.push(JSON.parse(line) as T);
      index += 1;
      if (items.length >= limit) break;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return items;
}
