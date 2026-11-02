export function readRecordingIndexItem<T>(dictionary: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(dictionary, id) ? dictionary[id] : undefined;
}
