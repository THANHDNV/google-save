import localforage from "localforage";
export type LocalForage = typeof localforage;

export const DATABASE_NAME = "google_save";
export enum TABLE {
  FILE_HISTORY = "file_history",
}

export enum FileFolderHistoryActionType {
  DELETE = "delete",
  RENAME = "rename",
  RENAME_DESTINATION = "rename_destination",
}

export enum FileFolderHistoryKeyType {
  FILE = "file",
  FOLDER = "folder",
}

export interface FileFolderHistoryRecord {
  key: string;
  ctime: number;
  mtime: number;
  size: number;
  actionWhen: number;
  actionType: FileFolderHistoryActionType;
  keyType: FileFolderHistoryKeyType;
  renameTo: string;
  vaultRandomID: string;
}
