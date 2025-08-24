import {
  Notice,
  TFile,
  TFolder,
  Vault,
  normalizePath,
  requireApiVersion,
  Events,
} from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { FILE_STAT_SUPPORT_VERSION, METADATA_FILE } from "../types";
import { FileHandler } from "./FileHandler";
import {
  AssembleMixedStatesArgs,
  DecisionTypeForFile,
  DecisionTypeForFolder,
  DispatchOperationToActualArgs,
  DoActualSyncArgs,
  FileOrFolderMixedState,
  GetSyncPlanArgs,
  GoogleDriveApplicationMimeType,
  RemoteFile,
  SyncTriggerSourceType,
  UploadExtraMetaArgs,
} from "../types/file";
import { DeletionOnRemote, MetadataOnRemote } from "../types/metadata";
import { FileFolderHistoryActionType } from "../types/database";
import { GoogleSaveDb } from "../database";
import {
  arrayBufferToString,
  createNotice,
  getParentFolder,
  getParentPath,
  isEqualMetadataOnRemote,
  statFix,
  stringToArrayBuffer,
} from "../shared/utils";
import pLimit from "p-limit";
import { v4 as uuid } from "uuid";
import md5 from "md5";

export class FileSync {
  private fileHandler: FileHandler;
  private vault: Vault;
  private googleDriveFiles: GoogleDriveFiles;
  private db: GoogleSaveDb;
  private isRunning = false;

  constructor(public readonly plugin: GoogleSavePlugin) {
    this.googleDriveFiles = this.plugin.googleDriveFiles;
    this.vault = this.plugin.app.vault;
    this.fileHandler = new FileHandler(this);
    this.db = this.plugin.db;
  }

  public async sync(syncTriggerSource?: SyncTriggerSourceType) {
    if (this.isRunning) {
      createNotice("Sync is already running!");
      return;
    }
    this.isRunning = true;
    this.plugin.updateSyncRunningStatus();

    createNotice(`Sync started; Source: ${syncTriggerSource}`);
    const start = Date.now();

    try {
      const remoteFiles = await this.getRemote();
      const { remoteStates, metadataFile } = await this.parseRemoteFiles(
        remoteFiles
      );

      const metadataOnRemote = await this.getRemoteMetadataFile(
        metadataFile?.remoteKey
      );

      const localFiles = await this.getLocal();

      const localFileHistory = Object.values(
        await this.db.fileHistory.getAll()
      ).sort((a, b) => a.actionWhen - b.actionWhen);

      const { plan, sortedKeys, deletions } = await this.getSyncPlan({
        localFileHistory,
        localFiles,
        remoteDeleteFiles: metadataOnRemote.deletions || [],
        remoteFileStates: remoteStates,
        syncTriggerSource,
      });

      createNotice("Got the plan!");

      // clear sync meta mapping data except for certain keys
      await this.fileHandler.clearSyncMetaMappingDataExceptFor(
        Object.values(plan.mixedStates)
          .filter((f) => !!f.remoteKey)
          .map((f) => f.remoteKey!)
      );

      await this.doActualSync({
        syncPlan: plan,
        deletions,
        metadataFile,
        origMetadata: metadataOnRemote,
        sortedKeys,
        concurrency: this.plugin.settings.concurrency,
      });

      // console.log(plan, sortedKeys, deletions);
    } catch (error) {
      // TODO: think of a better way to do this
      console.log(error);

      createNotice("Some error occurred, sync ended");
    } finally {
      this.isRunning = false;
      this.plugin.updateSyncFinishedStatus();
    }

    const end = Date.now();

    createNotice(`Sync completed in: ${(end - start) / 1000}s`);
  }

  private async getMd5Checksum(content: ArrayBuffer): Promise<string> {
    return md5(new Uint8Array(content));
  }

  private async getRemote() {
    const rootFolderId = await this.fileHandler.getRootRemoteId();

    const files = await this.googleDriveFiles.getAllFiles(rootFolderId, "/");

    return files;
  }

  private async parseRemoteFiles(remoteFiles: RemoteFile[]): Promise<{
    remoteStates: FileOrFolderMixedState[];
    metadataFile?: FileOrFolderMixedState;
  }> {
    if (remoteFiles.length === 0) {
      return { remoteStates: [] };
    }

    const remoteStates: FileOrFolderMixedState[] = [];
    let metadataFile: FileOrFolderMixedState | undefined = undefined;

    for (const remoteFile of remoteFiles) {
      const isFolder = remoteFile.mimeType === GoogleDriveApplicationMimeType;
      let fileFullPath = normalizePath(`${remoteFile.path}/${remoteFile.name}`);

      if (isFolder) {
        fileFullPath = `${fileFullPath}/`;
      }
      const mTimeRemote = new Date(remoteFile.modifiedTime).getTime();

      const backwardMapping =
        await this.fileHandler.getSyncMetaMappingByRemoteKey({
          remoteKey: remoteFile.id,
          mTimeRemote,
        });

      let file: FileOrFolderMixedState;

      if (backwardMapping) {
        file = {
          key: backwardMapping.localKey,
          remoteKey: remoteFile.id,
          existRemote: true,
          sizeRemote: backwardMapping.localSize,
          mtimeRemote: backwardMapping.localMtime ?? mTimeRemote,
          remoteHash: remoteFile.md5Checksum,
        };
      } else {
        file = {
          key: fileFullPath,
          remoteKey: remoteFile.id,
          existRemote: true,
          mtimeRemote: mTimeRemote,
          sizeRemote: isFolder ? 0 : parseInt(remoteFile.size),
          remoteHash: remoteFile.md5Checksum,
        };
      }

      remoteStates.push(file);

      if (file.key === METADATA_FILE) {
        metadataFile = file;
      }
    }

    return {
      remoteStates,
      metadataFile,
    };
  }

  private async getLocal() {
    const files = this.vault.getAllLoadedFiles();

    return files;
  }

  private async getRemoteMetadataFile(
    metadataFileId?: string
  ): Promise<MetadataOnRemote> {
    if (!metadataFileId) {
      return {
        deletions: [],
      };
    }

    const metaDataFileContentArrayBuffer = await this.googleDriveFiles.get(
      metadataFileId,
      true
    );

    const metadataFileContent = arrayBufferToString(
      metaDataFileContentArrayBuffer
    );
    const metadataFile = JSON.parse(metadataFileContent) as MetadataOnRemote;

    return metadataFile;
  }

  private async getSyncPlan({
    remoteFileStates,
    localFiles,
    remoteDeleteFiles,
    localFileHistory,
    syncTriggerSource,
  }: GetSyncPlanArgs) {
    const mixedStates = await this.assembleMixedStates({
      remoteFileStates,
      localFiles,
      remoteDeleteFiles,
      localFileHistory,
    });

    const sortedKeys = Object.keys(mixedStates).sort(
      (k1, k2) => k2.length - k1.length
    );

    const deletions: DeletionOnRemote[] = [];

    const keptFolder = new Set<string>();

    for (const key of sortedKeys) {
      const val = mixedStates[key];

      if (key.endsWith("/")) {
        mixedStates[key] = await this.assignOperationToFolder(val, keptFolder);
      } else {
        mixedStates[key] = await this.assignOperationToFile(val, keptFolder);
      }

      let actionWhen: number | undefined = undefined;

      if (
        mixedStates[key].decision ===
        DecisionTypeForFile.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE
      ) {
        actionWhen = mixedStates[key].deltimeLocal;
      }

      if (
        mixedStates[key].decision ===
        DecisionTypeForFile.KEEP_REMOTE_DELETE_HISTORY
      ) {
        actionWhen = mixedStates[key].deltimeRemote;
      }

      if (
        mixedStates[key].decision ===
        DecisionTypeForFolder.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER
      ) {
        actionWhen = mixedStates[key].deltimeLocal;
      }

      if (
        mixedStates[key].decision ===
        DecisionTypeForFolder.KEEP_REMOTE_DELETE_HISTORY_FOLDER
      ) {
        actionWhen = mixedStates[key].deltimeRemote;
      }

      if (actionWhen) {
        deletions.push({
          key,
          actionWhen,
        });
      }
    }

    const plan = {
      ts: Date.now(),
      syncTriggerSource,
      mixedStates,
    };
    return {
      plan,
      sortedKeys: sortedKeys.sort((a, b) => a.length - b.length),
      deletions: deletions,
    };
  }

  private async assembleMixedStates({
    remoteFileStates,
    localFiles,
    remoteDeleteFiles,
    localFileHistory,
  }: AssembleMixedStatesArgs): Promise<Record<string, FileOrFolderMixedState>> {
    const result = remoteFileStates.reduce<
      Record<string, FileOrFolderMixedState>
    >((result, remoteFileState) => {
      const key = remoteFileState.key;

      if (this.isSkippableFile(key)) {
        return result;
      }

      result[key] = remoteFileState;
      result[key].existRemote = true;

      return result;
    }, {});

    for (const localFile of localFiles) {
      const key =
        localFile instanceof TFile ? localFile.path : `${localFile.path}/`;

      if (this.isSkippableFile(key)) {
        continue;
      }

      if (localFile.path === "/") {
        continue;
      }

      let r: FileOrFolderMixedState | null = null;

      if (localFile instanceof TFile) {
        const mtimeLocal = Math.max(
          localFile.stat.mtime ?? 0,
          localFile.stat.ctime ?? 0
        );

        r = {
          key,
          mtimeLocal,
          sizeLocal: localFile.stat.size,
          localHash: await this.getMd5Checksum(
            await this.vault.readBinary(localFile)
          ),
        };
      } else if (localFile instanceof TFolder) {
        r = {
          key,
          sizeLocal: 0,
        };
      } else {
        throw new Error("Unknown file type");
      }

      if (result[key]) {
        result[key] = {
          ...result[key],
          ...r,
          existLocal: true,
        };
      } else {
        result[key] = {
          ...r,
          existLocal: true,
          existRemote: false,
        };
      }
    }

    for (const remoteDelete of remoteDeleteFiles) {
      const key = remoteDelete.key;

      const r: FileOrFolderMixedState = {
        key,
        deltimeRemote: remoteDelete.actionWhen,
      };

      if (this.isSkippableFile(key)) {
        continue;
      }

      if (result[key]) {
        result[key] = {
          ...result[key],
          ...r,
        };
      } else {
        result[key] = {
          ...r,
          existLocal: false,
          existRemote: false,
        };
      }
    }

    for (const fileHistory of localFileHistory) {
      let key = fileHistory.key;

      if (fileHistory.keyType === "folder") {
        if (!fileHistory.key.endsWith("/")) {
          key = `${fileHistory.key}/`;
        }
      }

      if (this.isSkippableFile(key)) {
        continue;
      }

      switch (fileHistory.actionType) {
        case FileFolderHistoryActionType.DELETE:
        case FileFolderHistoryActionType.RENAME:
          {
            const r: FileOrFolderMixedState = {
              key,
              deltimeLocal: fileHistory.actionWhen,
            };

            if (result[key]) {
              result[key] = {
                ...result[key],
                ...r,
              };
            } else {
              result[key] = {
                ...r,
                existLocal: false,
                existRemote: false,
              };
            }
          }
          break;
        case FileFolderHistoryActionType.RENAME_DESTINATION:
          {
            const r: FileOrFolderMixedState = {
              key,
              mtimeLocal: fileHistory.actionWhen,
              changeLocalMtimeUsingMapping: true,
            };

            if (result[key]) {
              let mtimeLocal: number | undefined = Math.max(
                r.mtimeLocal ?? 0,
                result[key].mtimeLocal ?? 0
              );
              if (Number.isNaN(mtimeLocal) || mtimeLocal === 0) {
                mtimeLocal = undefined;
              }

              result[key] = {
                ...result[key],
                ...r,
                mtimeLocal,
              };
            }
          }
          break;
        default:
          throw new Error(
            `Unknown action type ${fileHistory.actionType} file ${fileHistory.key}`
          );
      }
    }

    return Object.entries(result).reduce((acc, [key, val]) => {
      if (val.existLocal || val.existRemote) {
        acc[key] = val;
      }

      return acc;
    }, {} as Record<string, FileOrFolderMixedState>);
  }

  private isSkippableFile(key: string) {
    if (key === METADATA_FILE) {
      return true;
    }

    return false;
  }

  private async assignOperationToFolder(
    originRecord: FileOrFolderMixedState,
    keptFolder: Set<string>
  ) {
    const r = {
      ...originRecord,
    };

    if (!r.key.endsWith("/")) {
      return r;
    }

    if (!keptFolder.has(r.key)) {
      if (!!r.deltimeLocal || !!r.deltimeRemote) {
        const deltimeLocal = !!r.deltimeLocal ? r.deltimeLocal : 0;
        const deltimeRemote = !!r.deltimeRemote ? r.deltimeRemote : 0;

        // stat API made available
        if (requireApiVersion(FILE_STAT_SUPPORT_VERSION)) {
          if (r.existLocal) {
            const fileStat = await statFix(this.vault, r.key);
            const cmtime = Math.max(fileStat?.ctime ?? 0, fileStat?.mtime ?? 0);

            if (
              !Number.isNaN(cmtime) &&
              cmtime > 0 &&
              cmtime >= deltimeLocal &&
              cmtime >= deltimeRemote
            ) {
              keptFolder.add(getParentFolder(r.key));

              if (r.existLocal && r.existRemote) {
                r.decision = DecisionTypeForFolder.SKIP_FOLDER;
                r.decisionBranch = 14;
              } else if (r.existLocal || r.existRemote) {
                r.decision = DecisionTypeForFolder.CREATE_FOLDER;
                r.decisionBranch = 15;
              } else {
                throw Error(
                  `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
                );
              }
            }
          }
        }

        if (
          r.existLocal &&
          r.changeLocalMtimeUsingMapping &&
          (r.mtimeLocal || 0) > 0 &&
          (r.mtimeLocal || 0) > deltimeLocal &&
          (r.mtimeLocal || 0) > deltimeRemote
        ) {
          keptFolder.add(getParentFolder(r.key));
          if (r.existLocal && r.existRemote) {
            r.decision = DecisionTypeForFolder.SKIP_FOLDER;
            r.decisionBranch = 16;
          } else if (r.existLocal || r.existRemote) {
            r.decision = DecisionTypeForFolder.CREATE_FOLDER;
            r.decisionBranch = 17;
          } else {
            throw Error(
              `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
            );
          }
        }

        if (r.decision === undefined) {
          // not yet decided by the above reason
          if (deltimeLocal > 0 && deltimeLocal > deltimeRemote) {
            r.decision =
              DecisionTypeForFolder.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER;
            r.decisionBranch = 8;
          } else {
            r.decision =
              DecisionTypeForFolder.KEEP_REMOTE_DELETE_HISTORY_FOLDER;
            r.decisionBranch = 9;
          }
        }
      } else {
        keptFolder.add(getParentFolder(r.key));
        if (r.existLocal && r.existRemote) {
          r.decision =
            DecisionTypeForFolder.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER;
          r.decisionBranch = 10;
        } else if (r.existLocal || r.existRemote) {
          r.decision = DecisionTypeForFolder.KEEP_REMOTE_DELETE_HISTORY_FOLDER;
          r.decisionBranch = 11;
        } else {
          throw Error(
            `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
          );
        }
      }
    } else {
      keptFolder.add(getParentFolder(r.key));
      if (r.existLocal && r.existRemote) {
        r.decision = DecisionTypeForFolder.SKIP_FOLDER;
        r.decisionBranch = 12;
      } else if (r.existLocal || r.existRemote) {
        r.decision = DecisionTypeForFolder.CREATE_FOLDER;
        r.decisionBranch = 13;
      } else {
        throw Error(
          `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
        );
      }
    }

    return r;
  }

  private async assignOperationToFile(
    originRecord: FileOrFolderMixedState,
    keptFolder: Set<string>
  ) {
    const r: FileOrFolderMixedState = {
      ...originRecord,
    };

    if (r.key.endsWith("/")) {
      return r;
    }

    if (r.existLocal && (r.mtimeLocal === undefined || r.mtimeLocal <= 0)) {
      throw Error(
        `Error: Abnormal last modified time locally: ${JSON.stringify(
          r,
          null,
          2
        )}`
      );
    }
    if (r.existRemote && (r.mtimeRemote === undefined || r.mtimeRemote <= 0)) {
      throw Error(
        `Error: Abnormal last modified time remotely: ${JSON.stringify(
          r,
          null,
          2
        )}`
      );
    }
    if (r.deltimeLocal !== undefined && r.deltimeLocal <= 0) {
      throw Error(
        `Error: Abnormal deletion time locally: ${JSON.stringify(r, null, 2)}`
      );
    }
    if (r.deltimeRemote !== undefined && r.deltimeRemote <= 0) {
      throw Error(
        `Error: Abnormal deletion time remotely: ${JSON.stringify(r, null, 2)}`
      );
    }

    const sizeRemoteComp = r.sizeRemote;

    const mtimeRemote = r.existRemote ? r.mtimeRemote ?? 0 : 0;
    const deltimeRemote = r.deltimeRemote !== undefined ? r.deltimeRemote : 0;
    const deltimeLocal = r.deltimeLocal !== undefined ? r.deltimeLocal : 0;
    const mtimeLocal = r.existLocal ? r.mtimeLocal ?? 0 : 0;

    // 1. mtimeLocal
    if (r.existLocal) {
      if (
        mtimeLocal >= mtimeRemote &&
        mtimeLocal >= deltimeLocal &&
        mtimeLocal >= deltimeRemote
      ) {
        if (r.sizeLocal === undefined) {
          throw new Error(
            `Error: no local size but has local mtime: ${JSON.stringify(
              r,
              null,
              2
            )}`
          );
        }

        if (r.remoteHash && r.localHash === r.remoteHash) {
          // local and remote both exist and mtimes are the same
          r.decision = DecisionTypeForFile.SKIP_UPLOADING;
          r.decisionBranch = 1;
        } else {
          // we have local largest mtime,
          // and the remote not existing or smaller mtime
          r.decision = DecisionTypeForFile.UPLOAD_LOCAL_TO_REMOTE;
          r.decisionBranch = 4;
        }
        keptFolder.add(getParentFolder(r.key));
        return r;
      }
    }

    // 2. mtimeRemote
    if (r.existRemote) {
      if (
        mtimeRemote > mtimeLocal &&
        mtimeRemote >= deltimeLocal &&
        mtimeRemote >= deltimeRemote
      ) {
        // we have remote largest mtime,
        // and the local not existing or smaller mtime
        if (sizeRemoteComp === undefined) {
          throw new Error(
            `Error: no remote size but has remote mtime: ${JSON.stringify(
              r,
              null,
              2
            )}`
          );
        }

        if (r.localHash && r.remoteHash === r.localHash) {
          r.decision = DecisionTypeForFile.SKIP_UPLOADING;
          r.decisionBranch = 3;
        } else {
          r.decision = DecisionTypeForFile.DOWNLOAD_REMOTE_TO_LOCAL;
          r.decisionBranch = 5;
        }

        keptFolder.add(getParentFolder(r.key));
        return r;
      }
    }

    // 3. deltimeLocal
    if (deltimeLocal !== 0) {
      if (
        deltimeLocal >= mtimeLocal &&
        deltimeLocal >= mtimeRemote &&
        deltimeLocal >= deltimeRemote
      ) {
        r.decision = DecisionTypeForFile.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE;
        r.decisionBranch = 6;
        if (r.existLocal || r.existRemote) {
          // actual deletion would happen
        }
        return r;
      }
    }

    // 4. deltimeRemote
    if (r.deltimeRemote !== undefined && r.deltimeRemote !== 0) {
      if (
        r.deltimeRemote >= mtimeLocal &&
        r.deltimeRemote >= mtimeRemote &&
        r.deltimeRemote >= deltimeLocal
      ) {
        r.decision = DecisionTypeForFile.KEEP_REMOTE_DELETE_HISTORY;
        r.decisionBranch = 7;
        if (r.existLocal || r.existRemote) {
          // actual deletion would happen
        }
        return r;
      }
    }

    throw Error(`no decision for ${JSON.stringify(r)}`);
  }

  // TODO: actual support concurrency
  private async doActualSync({
    syncPlan,
    sortedKeys,
    metadataFile,
    origMetadata,
    deletions,
    concurrency = 1,
  }: DoActualSyncArgs) {
    const mixedStates = syncPlan.mixedStates;

    await this.uploadExtraMeta({
      metadataFile,
      origMetadata,
      deletions,
    });

    createNotice("Updated metadata on remote");

    const limit = pLimit(concurrency); // Limit to a certain concurrent operations
    const dependencyMap = new Map<string, string[]>(); // Tracks child dependencies
    const completionMap = new Map<string, Promise<void>>(); // Tracks completion promises
    let taskCount = 0;
    const fileAvailabilities = new Map<string, boolean>();

    for (const key of sortedKeys) {
      fileAvailabilities.set(key, true);
    }

    // Build dependency map

    await new Promise<void>(async (resolve) => {
      const id = uuid();
      const notice = new Notice(`Updated file 0/${sortedKeys.length}`, 0);

      const synEvent = new Events();

      synEvent.on(`synced-${id}`, (path?: string) => {
        taskCount++;

        notice.setMessage(`Updated file ${taskCount}/${sortedKeys.length}`);

        if (taskCount === sortedKeys.length) {
          setTimeout(() => {
            notice.hide();
          }, 3000);
          resolve();
        }
      });

      // build dependency map
      for (const filePath of sortedKeys) {
        const parentPath = getParentPath(filePath);

        if (parentPath && fileAvailabilities.get(parentPath)) {
          if (!dependencyMap.has(parentPath)) {
            dependencyMap.set(parentPath, []);
          }
          dependencyMap.get(parentPath)!.push(filePath);
        }
      }

      // Process a single path
      const processPath = async (key: string): Promise<void> => {
        const mixedState = mixedStates[key];

        // Wait for the parent path to complete, if it exists
        const parentPath = getParentPath(key);
        if (parentPath && completionMap.has(parentPath)) {
          await completionMap.get(parentPath);
        }

        // Sync the current path
        await this.dispatchOperationToActual({ key, mixedState, mixedStates });
        synEvent.trigger(`synced-${id}`, key);

        // Mark this path as completed and trigger dependent paths
        if (dependencyMap.has(key)) {
          const children = dependencyMap.get(key)!;
          for (const child of children) {
            if (!completionMap.has(child)) {
              const childTask = limit(() => processPath(child));
              completionMap.set(child, childTask);
            }
          }
        }
      };

      // Start processing root paths (paths with no dependencies)
      for (const key of sortedKeys) {
        const parentPath = getParentPath(key);
        if (!parentPath || !fileAvailabilities.get(parentPath)) {
          if (!completionMap.has(key)) {
            const rootTask = limit(() => processPath(key));
            completionMap.set(key, rootTask);
          }
        }
      }
    });
  }

  private async uploadExtraMeta({
    deletions,
    metadataFile,
    origMetadata,
  }: UploadExtraMetaArgs) {
    const newMetadata: MetadataOnRemote = {
      deletions,
    };

    if (isEqualMetadataOnRemote(origMetadata, newMetadata)) {
      return;
    }

    if (!metadataFile?.remoteKey) {
      const rootId = await this.fileHandler.getRootRemoteId();

      await this.googleDriveFiles.create(
        METADATA_FILE,
        rootId,
        stringToArrayBuffer(JSON.stringify(newMetadata))
      );

      return;
    } else {
      await this.googleDriveFiles.updateFile(
        metadataFile.remoteKey,
        stringToArrayBuffer(JSON.stringify(newMetadata))
      );
    }
  }

  private async dispatchOperationToActual({
    key,
    mixedState,
    mixedStates,
  }: DispatchOperationToActualArgs) {
    switch (mixedState.decision) {
      case DecisionTypeForFolder.SKIP_FOLDER:
        if (mixedState.existLocal && mixedState.existRemote) {
          await this.db.localToRemoteKeyMapping.set(key, mixedState.remoteKey!);
        }
      case DecisionTypeForFile.SKIP_UPLOADING:
        // do nothing
        break;
      case DecisionTypeForFile.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE:
      case DecisionTypeForFile.KEEP_REMOTE_DELETE_HISTORY:
      case DecisionTypeForFolder.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER:
      case DecisionTypeForFolder.KEEP_REMOTE_DELETE_HISTORY_FOLDER:
        if (mixedState.existLocal) {
          // remove local
          await this.fileHandler.trash(key);
        }

        if (mixedState.existRemote && mixedState.remoteKey) {
          // remove remote
          const parentPath = getParentPath(key);
          if (
            parentPath &&
            mixedStates[parentPath] &&
            mixedStates[parentPath].existRemote &&
            [
              DecisionTypeForFile.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE,
              DecisionTypeForFolder.UPLOAD_LOCAL_DELETE_HISTORY_TO_REMOTE_FOLDER,
            ].includes(mixedStates[parentPath].decision!)
          ) {
            // If the parent folder is also being deleted, we can skip this file
            break;
          }
          await this.googleDriveFiles.deleteFile(mixedState.remoteKey);
        }

        // remove from history table in local
        await this.fileHandler.clearDeleteRenameHistoryOfKeyAndVault(
          mixedState.key
        );
        break;

      case DecisionTypeForFile.UPLOAD_LOCAL_TO_REMOTE:
        await this.fileHandler.uploadFile(mixedState);
        break;
      case DecisionTypeForFile.DOWNLOAD_REMOTE_TO_LOCAL:
        if (!mixedState.remoteKey) {
          throw new Error(
            `remote file without remote key? ${JSON.stringify(mixedState)}`
          );
        }

        await this.fileHandler.downloadRemoteToLocal(
          mixedState.key,
          mixedState.remoteKey as string
        );
        break;
      case DecisionTypeForFolder.CREATE_FOLDER:
        if (!mixedState.existLocal) {
          await this.fileHandler.createFolderLocal(mixedState.key);
        }

        if (!mixedState.existRemote) {
          await this.fileHandler.uploadFolder(mixedState);
        }
        break;
      default:
        throw Error(`no decision for ${JSON.stringify(mixedState)}`);
    }
  }
}
