import localforage from "localforage";
import { DATABASE_NAME } from "../types/database";

export class GoogleSaveDbTable<T = any> {
  private readonly table: LocalForage;

  constructor(name: string) {
    this.table = localforage.createInstance({
      name: DATABASE_NAME,
      storeName: name,
    });
  }

  set(key: string, value: T): Promise<T> {
    return this.table.setItem<T>(key, value);
  }

  get(key: string): Promise<T | null> {
    return this.table.getItem<T>(key);
  }

  delete(key: string) {
    return this.table.removeItem(key);
  }

  getAll(): Promise<
    {
      key: string;
      value: T | null;
    }[]
  > {
    return this.table.keys().then((keys) =>
      Promise.all(
        keys.map(async (key) => ({
          key,
          value: await this.table.getItem<T>(key),
        }))
      )
    );
  }

  iterate(
    iteratee: (value: T, key: string, iterationNumber: number) => void,
    callback?: (err: any, result: void) => void
  ): Promise<void> {
    return this.table.iterate(iteratee, callback);
  }

  clear() {
    return this.table.clear();
  }
}
