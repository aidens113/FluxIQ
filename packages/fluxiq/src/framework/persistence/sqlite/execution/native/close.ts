import type sqlite3 from "sqlite3";
import type { SQLiteNativeObservation } from "./observation.ts";

export function close(db: sqlite3.Database, observation?: SQLiteNativeObservation): Promise<void> {
  if (observation) return observation.close(db);
  return new Promise((resolve, reject) => {
    db.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}
