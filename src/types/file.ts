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

export interface FileOrFolderMixedState {
  /** file or folder path */
  key: string;

  /** remote uuid */
  remoteKey: string;

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

  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;

  /** how should file be handled */
  decision?: DecisionType;

  /** for debugging purpose only */
  decisionBranch?: number;

  /** mark file as sync from/to remote */
  syncDone?: boolean;
}
