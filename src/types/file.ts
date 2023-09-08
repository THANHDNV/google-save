export enum DecisionTypeForFile {
  SKIP_UPLOADING = 'skipUploading',
  UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE = 'uploadLocalDelHistToRemote',
  KEEP_REMOTE_DELETE_HISTORY = 'keepRemoteDelHist',
  UPLOAD_LOCAL_TO_REMOTE = 'uploadLocalToRemote',
  DOWNLOAD_REMOTE_TO_LOCAL = 'downloadRemoteToLocal'
}

export enum DecisionTypeForFolder {
  CREATE_FOLDER = "createFolder",
  UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER = "uploadLocalDelHistToRemoteFolder",
  KEEP_REMOTE_DELETE_HISTORY_FOLDER = "keepRemoteDelHistFolder",
  SKIP_FOLDER = "skipFolder"
}

export type DecisionType = DecisionTypeForFile | DecisionTypeForFolder

export interface FileOrFolderMixedState {
  /** file or folder path */
  key: string;
  /** remote uuid */
  remoteKey: string
  existLocal?: boolean;
  existRemote?: boolean;
  mtimeLocal?: number;
  mtimeRemote?: number;
  deltimeLocal?: number;
  deltimeRemote?: number;
  sizeLocal?: number;
  sizeRemote?: number;
  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;
  decision?: DecisionType;
  decisionBranch?: number;
  syncDone?: boolean;
}
