import {
  TAbstractFile,
  TFile,
  TFolder,
  Vault,
  requireApiVersion,
} from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { createNotice, getFolderLevels, statFix } from "../shared/utils";
import {
  FileOrFolderMixedState,
  GoogleDriveApplicationMimeType,
  SyncTriggerSourceType,
} from "../types/file";
import { GoogleSaveDb } from "../database";
import {
  FileFolderHistoryActionType,
  FileFolderHistoryKeyType,
  FileFolderHistoryRecord,
  SyncMetaMappingRecord,
} from "../types/database";
import { FILE_STAT_SUPPORT_VERSION } from "../types";
import { FileSync } from "./FileSync";

export class FileHandler {
  private readonly plugin: GoogleSavePlugin;
  private readonly vault: Vault;
  private readonly googleDriveFiles: GoogleDriveFiles;
  private readonly db: GoogleSaveDb;

  constructor(private readonly fileSync: FileSync) {
    this.plugin = this.fileSync.plugin;
    this.vault = this.plugin.app.vault;
    this.googleDriveFiles = this.plugin.googleDriveFiles;
    this.db = this.plugin.db;

    this.plugin.app.workspace.onLayoutReady(() => {
      this.enableAutoSyncIfSet();
      this.registerVaultEvents();
      this.enableInitSyncIfSet();
    });
  }

  private enableAutoSyncIfSet() {
    if (this.plugin.settings.autoRunMillisecond) {
      this.plugin.settings.autoRunIntervalId = window.setInterval(async () => {
        await this.fileSync.sync(SyncTriggerSourceType.AUTO);
      }, this.plugin.settings.autoRunMillisecond);
    }
  }

  private enableInitSyncIfSet() {
    if ((this.plugin.settings.initRunAfterMillisecond ?? -1) >= 0) {
      window.setTimeout(async () => {
        await this.fileSync.sync(SyncTriggerSourceType.AUTO_ONCE_INIT);
      }, this.plugin.settings.initRunAfterMillisecond);
    }
  }

  public async getRootRemoteId() {
    let remoteId = await this.db.localToRemoteKeyMapping.get("/");
    if (remoteId) {
      return remoteId;
    }

    await this.checkRootFolder();
    remoteId = (await this.db.localToRemoteKeyMapping.get("/")) as string;

    return remoteId;
  }

  private async checkRootFolder() {
    const rootDir = this.plugin.settings.rootDir || this.vault.getName();

    const foundFolder = await this.googleDriveFiles.list({
      q: `mimeType='${GoogleDriveApplicationMimeType}' and trashed=false and name='${rootDir}' and 'root' in parents`,
    });

    if (foundFolder.files.length >= 1) {
      await this.addFileMapping(foundFolder.files[0].id, "/");

      return;
    }

    const result = await this.googleDriveFiles.createFolder(rootDir);

    const { id } = result;

    await this.addFileMapping(id, "/");

    createNotice("Create root folder");
  }

  private registerVaultEvents() {
    // this.plugin.registerEvent(
    //   this.vault.on("create", this.handleCreateEvent.bind(this))
    // );

    // const onModify = debounce(this.handleModifyEvent.bind(this), 1500, true);
    // this.plugin.registerEvent(this.vault.on("modify", onModify));

    this.plugin.registerEvent(
      this.vault.on("delete", this.insertDeleteRecord.bind(this))
    );

    this.plugin.registerEvent(
      this.vault.on("rename", this.insertRenameRecord.bind(this))
    );
  }

  private async insertDeleteRecord(fileOrFolder: TFile | TFolder) {
    let k: FileFolderHistoryRecord;

    if (fileOrFolder instanceof TFile) {
      k = {
        key: fileOrFolder.path,
        ctime: fileOrFolder.stat.ctime,
        mtime: fileOrFolder.stat.mtime,
        size: fileOrFolder.stat.size,
        actionWhen: Date.now(),
        actionType: FileFolderHistoryActionType.DELETE,
        keyType: FileFolderHistoryKeyType.FILE,
        renameTo: "",
      };
    } else {
      const key = fileOrFolder.path.endsWith("/")
        ? fileOrFolder.path
        : `${fileOrFolder.path}/`;
      const ctime = 0; // they are deleted, so no way to get ctime, mtime
      const mtime = 0; // they are deleted, so no way to get ctime, mtime
      k = {
        key: key,
        ctime: ctime,
        mtime: mtime,
        size: 0,
        actionWhen: Date.now(),
        actionType: FileFolderHistoryActionType.DELETE,
        keyType: FileFolderHistoryKeyType.FOLDER,
        renameTo: "",
      };
    }

    await this.db.fileHistory.set(k.key, k);
  }

  private async insertRenameRecord(
    fileOrFolder: TFile | TFolder,
    oldPath: string
  ) {
    let k1: FileFolderHistoryRecord;
    let k2: FileFolderHistoryRecord;
    const actionWhen = Date.now();
    if (fileOrFolder instanceof TFile) {
      k1 = {
        key: oldPath,
        ctime: fileOrFolder.stat.ctime,
        mtime: fileOrFolder.stat.mtime,
        size: fileOrFolder.stat.size,
        actionWhen: actionWhen,
        actionType: FileFolderHistoryActionType.RENAME,
        keyType: FileFolderHistoryKeyType.FILE,
        renameTo: fileOrFolder.path,
      };
      k2 = {
        key: fileOrFolder.path,
        ctime: fileOrFolder.stat.ctime,
        mtime: fileOrFolder.stat.mtime,
        size: fileOrFolder.stat.size,
        actionWhen: actionWhen,
        actionType: FileFolderHistoryActionType.RENAME_DESTINATION,
        keyType: FileFolderHistoryKeyType.FILE,
        renameTo: "", // itself is the destination, so no need to set this field
      };
    } else if (fileOrFolder instanceof TFolder) {
      const key = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
      const renameTo = fileOrFolder.path.endsWith("/")
        ? fileOrFolder.path
        : `${fileOrFolder.path}/`;
      let ctime = 0;
      let mtime = 0;
      if (requireApiVersion(FILE_STAT_SUPPORT_VERSION)) {
        // TAbstractFile does not contain these info
        // but from API_VER_STAT_FOLDER we can manually stat them by path.
        const s = await statFix(this.vault, fileOrFolder.path);
        ctime = s.ctime;
        mtime = s.mtime;
      }
      k1 = {
        key: key,
        ctime: ctime,
        mtime: mtime,
        size: 0,
        actionWhen: actionWhen,
        actionType: FileFolderHistoryActionType.RENAME,
        keyType: FileFolderHistoryKeyType.FOLDER,
        renameTo: renameTo,
      };
      k2 = {
        key: renameTo,
        ctime: ctime,
        mtime: mtime,
        size: 0,
        actionWhen: actionWhen,
        actionType: FileFolderHistoryActionType.RENAME_DESTINATION,
        keyType: FileFolderHistoryKeyType.FOLDER,
        renameTo: "", // itself is the destination, so no need to set this field
      };
    }
  }

  private async addFileMapping(googleDriveId: string, path: string) {
    await this.db.localToRemoteKeyMapping.set(path, googleDriveId);
  }

  public async trash(x: string) {
    if (!(await this.vault.adapter.trashSystem(x))) {
      await this.vault.adapter.trashLocal(x);
    }

    if (x.endsWith("/")) {
      await this.db.localToRemoteKeyMapping.delete(x);
    }
  }

  public async clearDeleteRenameHistoryOfKeyAndVault(key: string) {
    const item = await this.db.fileHistory.get(key);

    if (
      item !== null &&
      (item.actionType === "delete" || item.actionType === "rename")
    ) {
      await this.db.fileHistory.delete(key);
    }
  }

  public async getSyncMetaMappingByRemoteKey({
    remoteKey,
    mTimeRemote,
  }: {
    remoteKey: string;
    mTimeRemote: number;
  }) {
    const potentialItem = await this.db.syncMapping.get(remoteKey);

    if (
      potentialItem &&
      potentialItem.remoteKey === remoteKey &&
      potentialItem.remoteMtime === mTimeRemote
    ) {
      return potentialItem;
    }

    return null;
  }

  public async upsertSyncMetaMappingDataByVault(
    data: Omit<SyncMetaMappingRecord, "keyType">
  ) {
    await this.db.syncMapping.set(data.remoteKey, {
      ...data,
      keyType: data.localKey.endsWith("/") ? "folder" : "file",
    });
  }

  public async uploadFile({
    key,
    remoteKey,
    mtimeLocal,
    mtimeRemote,
    sizeLocal,
    sizeRemote,
  }: FileOrFolderMixedState) {
    if (key.endsWith("/")) {
      return;
    }

    const pathSplit = key.split("/");
    const name = pathSplit.pop() as string;
    const parentFolder = `${pathSplit.join("/")}/`;

    // TODO: we should check if the parent folder exist or not
    // if not, let's recursively create one
    const parentFolderRemoteId = (await this.db.localToRemoteKeyMapping.get(
      parentFolder
    )) as string;

    const buffer = await this.vault.adapter.readBinary(key);

    let id: string;

    if (remoteKey) {
      const result = await this.googleDriveFiles.updateFile(remoteKey, buffer);

      id = result.id;
    } else {
      const result = await this.googleDriveFiles.create(
        name,
        parentFolderRemoteId,
        buffer
      );

      id = result.id;
    }

    await this.upsertSyncMetaMappingDataByVault({
      localKey: key,
      remoteKey: id,
      localMtime: mtimeLocal ?? 0,
      remoteMtime: mtimeRemote ?? 0,
      localSize: sizeLocal ?? 0,
      remoteSize: sizeRemote ?? 0,
    });
  }

  public async uploadFolder({
    key,
    mtimeLocal,
    mtimeRemote,
    sizeLocal,
    sizeRemote,
  }: FileOrFolderMixedState) {
    if (!key.endsWith("/")) {
      return;
    }

    const pathSplit = key.split("/");
    pathSplit.pop(); // last element of folder path split is an empty string

    const name = pathSplit.pop() as string;
    const parentFolder = `${pathSplit.join("/")}/`;

    // TODO: we should check if the parent folder exist or not
    // if not, let's recursively create one
    const parentFolderRemoteId = (await this.db.localToRemoteKeyMapping.get(
      parentFolder
    )) as string;

    const { id } = await this.googleDriveFiles.createFolder(
      name,
      parentFolderRemoteId
    );

    await Promise.all([
      this.db.localToRemoteKeyMapping.set(key, id),
      this.upsertSyncMetaMappingDataByVault({
        localKey: key,
        remoteKey: id,
        localMtime: mtimeLocal ?? 0,
        remoteMtime: mtimeRemote ?? 0,
        localSize: sizeLocal ?? 0,
        remoteSize: sizeRemote ?? 0,
      }),
    ]);
  }

  public async downloadRemoteToLocal(localKey: string, remoteKey: string) {
    if (localKey.endsWith("/")) {
      return;
    }

    const pathSplit = localKey.split("/");
    const name = pathSplit.pop() as string;
    const parentFolder = `${pathSplit.join("/")}/`;
    await this.createFolderLocal(parentFolder);

    const contentBuffer: ArrayBuffer = await this.googleDriveFiles.get(
      remoteKey,
      true
    );

    await this.vault.adapter.writeBinary(localKey, contentBuffer);
  }

  public async createFolderLocal(localKey: string) {
    if (!localKey.endsWith("/")) {
      return;
    }

    const foldersToBuild = getFolderLevels(localKey);

    for (const folder of foldersToBuild) {
      const r = await this.vault.adapter.exists(folder);

      if (!r) {
        await this.vault.adapter.mkdir(folder);
      }
    }
  }
}
