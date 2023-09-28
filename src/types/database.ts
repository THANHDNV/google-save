import localforage from "localforage";
export type LocalForage = typeof localforage;

export const DATABASE_NAME = "google_save";
export enum TABLE {
  FILE_HISTORY = "file_history",
  SYNC_MAPPING = "sync_mapping",
  LOCAL_TO_REMOTE = "local_to_remote",
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
}

export interface SyncMetaMappingRecord {
  localKey: string;
  remoteKey: string;
  localSize: number;
  remoteSize: number;
  localMtime: number;
  remoteMtime: number;
  keyType: "folder" | "file";
}
