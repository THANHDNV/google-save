import { Notice, Stat, Vault } from "obsidian";
import { MetadataOnRemote } from "../types/metadata";
import isEqual from "lodash.isequal";

const noticeMap: Map<string, moment.Moment> = new Map();

export const createNotice = (
  text: string,
  {
    ignoreTimeout = false,
    duration,
  }: {
    ignoreTimeout?: boolean;
    duration?: number;
  } = {}
) => {
  const now = window.moment();

  if (noticeMap.has(text)) {
    const lastDisplay = noticeMap.get(text);

    if (!lastDisplay || lastDisplay.isBefore(now) || ignoreTimeout) {
      new Notice(text, duration);
      noticeMap.set(text, now.add(1, "minute"));
    }
  } else {
    console.log(`[Google Saver] ${text}`);
    new Notice(text, duration);
    noticeMap.set(text, now.add(0, "minute"));
  }
};

export const getParentFolder = (a: string) => {
  const pathSplit = a.split("/");
  if (a.endsWith("/")) {
    pathSplit.pop();
  }
  pathSplit.pop();

  const b = pathSplit.join("/");

  return `${b}/`;
};

export const isEqualMetadataOnRemote = (
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
export const getFolderLevels = (x: string, addEndingSlash: boolean = false) => {
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

export const statFix = async (vault: Vault, path: string) => {
  const s: any = (await vault.adapter.stat(path)) as Stat;
  if (s.ctime === undefined || s.ctime === null || Number.isNaN(s.ctime)) {
    s.ctime = undefined;
  }
  if (s.mtime === undefined || s.mtime === null || Number.isNaN(s.mtime)) {
    s.mtime = undefined;
  }
  if (
    (s.size === undefined || s.size === null || Number.isNaN(s.size)) &&
    s.type === "folder"
  ) {
    s.size = 0;
  }
  return s;
};

export const arrayBufferToString = (arrayBuffer: ArrayBuffer): string => {
  return String.fromCharCode.apply(null, new Uint8Array(arrayBuffer));
};

export const stringToArrayBuffer = (str: string): ArrayBuffer => {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

export const getParentPath = (filePath: string): string | null => {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return "/" + parts.slice(0, -1).join("/");
};
