import { Notice } from "obsidian";
import path from "path";
import { MetadataOnRemote } from "../types/metadata";
import isEqual from "lodash.isequal";

export class Utils {
  private static noticeMap: Map<string, moment.Moment> = new Map();

  public static createNotice(text: string, ignoreTimeout = false): void {
    const now = window.moment();

    if (this.noticeMap.has(text)) {
      const lastDisplay = this.noticeMap.get(text);

      if (!lastDisplay || lastDisplay.isBefore(now) || ignoreTimeout) {
        new Notice(text);
        this.noticeMap.set(text, now.add(1, "minute"));
      }
    } else {
      console.log(`[Google Saver] ${text}`);
      new Notice(text);
      this.noticeMap.set(text, now.add(0, "minute"));
    }
  }

  public static getParentFolder = (a: string) => {
    const b = path.posix.dirname(a);
    if (b === "." || b === "/") {
      // the root
      return "/";
    }
    if (b.endsWith("/")) {
      return b;
    }
    return `${b}/`;
  };

  public static isEqualMetadataOnRemote = (
    a: MetadataOnRemote,
    b: MetadataOnRemote
  ) => {
    const m1 = a === undefined ? { deletions: [] } : a;
    const m2 = b === undefined ? { deletions: [] } : b;

    // we only need to compare deletions
    const d1 = m1.deletions === undefined ? [] : m1.deletions;
    const d2 = m2.deletions === undefined ? [] : m2.deletions;
    return isEqual(d1, d2);
  };

  /**
   * Util func for mkdir -p based on the "path" of original file or folder
   * "a/b/c/" => ["a", "a/b", "a/b/c"]
   * "a/b/c/d/e.txt" => ["a", "a/b", "a/b/c", "a/b/c/d"]
   * @param x string
   * @returns string[] might be empty
   */
  public static getFolderLevels = (
    x: string,
    addEndingSlash: boolean = false
  ) => {
    const res: string[] = [];

    if (x === "" || x === "/") {
      return res;
    }

    const y1 = x.split("/");
    let i = 0;
    for (let index = 0; index + 1 < y1.length; index++) {
      let k = y1.slice(0, index + 1).join("/");
      if (k === "" || k === "/") {
        continue;
      }
      if (addEndingSlash) {
        k = `${k}/`;
      }
      res.push(k);
    }
    return res;
  };
}
