export function writeRecordingIndexItem<T>(dictionary: Record<string, T>, id: string, value: T): void {
  Object.defineProperty(dictionary, id, { value, enumerable: true, configurable: true, writable: true });
}
