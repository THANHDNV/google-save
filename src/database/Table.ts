import localforage from "localforage";
import { DATABASE_NAME } from "../types/database";

export class GoogleSaveDbTable<T = any> {
  private readonly table: LocalForage;

  constructor(name: string, vaultId?: string) {
    this.table = localforage.createInstance({
      name: vaultId ? `${vaultId}/${DATABASE_NAME}` : DATABASE_NAME,
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

  getAll(): Promise<Record<string, T>> {
    return this.table.keys().then((keys) =>
      keys.reduce<Promise<Record<string, T>>>(async (listPromise, key) => {
        const list = await listPromise;

        const value = await this.get(key);

        if (value) {
          list[key] = value;
        }

        return list;
      }, Promise.resolve({}))
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
