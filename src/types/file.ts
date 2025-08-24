import { Stat, TAbstractFile } from "obsidian";
import { DeletionOnRemote, MetadataOnRemote } from "./metadata";
import { FileFolderHistoryRecord } from "./database";

export interface RemoteFile {
  id: string;
  mimeType: string;
  name: string;
  path: string;

  /** Date */
  modifiedTime: string;

  /** Number, size in bytes */
  size: string;

  /** MD5 checksum */
  md5Checksum: string;
}

export enum DecisionTypeForFile {
  SKIP_UPLOADING = "skipUploading",
  UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE = "uploadLocalDelHistToRemote",
  KEEP_REMOTE_DELETE_HISTORY = "keepRemoteDelHist",
  UPLOAD_LOCAL_TO_REMOTE = "uploadLocalToRemote",
  DOWNLOAD_REMOTE_TO_LOCAL = "downloadRemoteToLocal",
}

export enum DecisionTypeForFolder {
  CREATE_FOLDER = "createFolder",
  UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER = "uploadLocalDelHistToRemoteFolder",
  KEEP_REMOTE_DELETE_HISTORY_FOLDER = "keepRemoteDelHistFolder",
  SKIP_FOLDER = "skipFolder",
}

export type DecisionType = DecisionTypeForFile | DecisionTypeForFolder;

export const GoogleDriveApplicationMimeType =
  "application/vnd.google-apps.folder";

export interface FileOrFolderMixedState {
  /** file or folder path */
  key: string;

  /** remote uuid */
  remoteKey?: string;

  /** file exist local or not */
  existLocal?: boolean;

  /** file exist remote or not */
  existRemote?: boolean;

  /** local modified time,
   * <= 0 is considered to be falsy
   */
  mtimeLocal?: number;

  /** remote modified time,
   * <= 0 is considered to be falsy
   */
  mtimeRemote?: number;

  /** local deleted time,
   * <= 0 is considered to be falsy
   */
  deltimeLocal?: number;

  /** remote deleted time,
   * <= 0 is considered to be falsy
   */
  deltimeRemote?: number;

  /** local size */
  sizeLocal?: number;

  /** remote size */
  sizeRemote?: number;

  /** how should file be handled */
  decision?: DecisionType;

  /** for debugging purpose only */
  decisionBranch?: number;

  /** mark file as sync from/to remote */
  syncDone?: boolean;

  changeLocalMtimeUsingMapping?: boolean;

  remoteHash?: string;

  localHash?: string;
}

export type GetSyncPlanArgs = {
  localFiles: Array<TAbstractFile>;
  remoteFileStates: FileOrFolderMixedState[];
  remoteDeleteFiles: DeletionOnRemote[];
  localFileHistory: FileFolderHistoryRecord[];
  syncTriggerSource?: SyncTriggerSourceType;
};

export type AssembleMixedStatesArgs = {
  localFiles: Array<TAbstractFile>;
  remoteFileStates: FileOrFolderMixedState[];
  remoteDeleteFiles: DeletionOnRemote[];
  localFileHistory: FileFolderHistoryRecord[];
};

export enum SyncTriggerSourceType {
  MANUAL = "manual",
  AUTO = "auto",
  AUTO_ONCE_INIT = "auto_once_init",
}

export type SyncPlanType = {
  ts: number;
  syncTriggerSource?: SyncTriggerSourceType;
  mixedStates: Record<string, FileOrFolderMixedState>;
};

export type DoActualSyncArgs = {
  syncPlan: SyncPlanType;
  sortedKeys: string[];
  metadataFile?: FileOrFolderMixedState;
  origMetadata: MetadataOnRemote;
  deletions: DeletionOnRemote[];
  concurrency?: number;
};

export type UploadExtraMetaArgs = {
  metadataFile?: FileOrFolderMixedState;
  origMetadata: MetadataOnRemote;
  deletions: DeletionOnRemote[];
};

export type DispatchOperationToActualArgs = {
  mixedState: FileOrFolderMixedState;
  mixedStates: Record<string, FileOrFolderMixedState>;
  key: string;
};
