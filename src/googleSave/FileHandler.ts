import { TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { Utils } from "../shared/utils";
import {
  FileOrFolderMixedState,
  GoogleDriveApplicationMimeType,
} from "../types/file";
import { GoogleSaveDb } from "../database";
import { SyncMetaMappingRecord } from "../types/database";

export class FileHandler {
  private googleDriveFiles: GoogleDriveFiles;
  private db: GoogleSaveDb;

  constructor(private readonly plugin: GoogleSavePlugin) {
    this.googleDriveFiles = this.plugin.googleDriveFiles;
    this.db = this.plugin.db;

    this.plugin.app.workspace.onLayoutReady(() => {
      this.checkRootFolder();
      this.registerVaultEvents();
    });
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
    const rootDir =
      this.plugin.settings.rootDir || this.plugin.app.vault.getName();

    const foundFolder = await this.googleDriveFiles.list({
      q: `mimeType='${GoogleDriveApplicationMimeType}' and trashed=false and name='${rootDir}' and 'root' in parents`,
    });

    if (foundFolder.files.length >= 1) {
      if (!this.plugin.settings.fileMap[foundFolder.files[0].id]) {
        await this.addFileMapping(foundFolder.files[0].id, "/");
      }

      return;
    }

    const result = await this.googleDriveFiles.createFolder(rootDir);

    const { id } = result;

    await this.addFileMapping(id, "/");

    Utils.createNotice("Create root folder");
  }

  private registerVaultEvents() {
    this.plugin.registerEvent(
      this.plugin.app.vault.on("create", this.handleCreateEvent.bind(this))
    );

    const onModify = debounce(this.handleModifyEvent.bind(this), 1500, true);
    this.plugin.registerEvent(this.plugin.app.vault.on("modify", onModify));

    this.plugin.registerEvent(
      this.plugin.app.vault.on("delete", this.handleDeleteEvent.bind(this))
    );

    this.plugin.registerEvent(
      this.plugin.app.vault.on("rename", this.handleRenameEvent.bind(this))
    );
  }

  private async handleCreateEvent(file: TFile | TFolder) {
    const isFolder = file instanceof TFolder;

    if (isFolder) {
      const { id } = await this.googleDriveFiles.createFolder(
        file.name,
        this.getFolderIdFromPath(file.path)
      );

      await this.addFileMapping(id, "/" + file.path);

      Utils.createNotice(`Create folder ${file.name}`);

      return;
    }

    const fileData = await this.plugin.app.vault.adapter.readBinary(file.path);

    const { id } = await this.googleDriveFiles.create(
      file.name,
      this.getFolderIdFromPath(file.path),
      fileData
    );

    await this.addFileMapping(id, "/" + file.path);
    Utils.createNotice(`Create file ${file.name}`);
  }

  private async handleRenameEvent(file: TAbstractFile, oldPath: string) {
    const oldPathSplit = oldPath.split("/");
    const oldFileName = oldPathSplit[oldPathSplit.length - 1];
    const isMovingFile = file.name === oldFileName;

    const fileId = this.getFileIdFromPath(oldPath);

    if (!fileId) {
      Utils.createNotice(`File ${oldPath} not found in mapping`);
    }

    const oldFolderId = this.getFolderIdFromPath(oldPath);
    const newFolderId = this.getFolderIdFromPath(file.path);

    await this.googleDriveFiles.moveOrRenameFile(
      fileId,
      oldFolderId,
      newFolderId,
      file.name
    );

    await this.updateFileMapping("/" + file.path, "/" + oldPath);

    Utils.createNotice(
      `${isMovingFile ? "Moved" : "Renamed"} file ${file.name}`
    );
  }

  private async handleDeleteEvent(file: TAbstractFile) {
    const fileId = this.getFileIdFromPath(file.path);

    await this.googleDriveFiles.deleteFile(fileId);

    await this.deleteFileMapping("/" + file.path);

    Utils.createNotice(
      `Delete ${file instanceof TFolder ? "folder" : "file"} ${file.name}`
    );
  }

  private async handleModifyEvent(file: TAbstractFile) {
    const fileId = this.getFileIdFromPath(file.path);

    const fileData = await this.plugin.app.vault.adapter.readBinary(file.path);

    const result = await this.googleDriveFiles.updateFile(fileId, fileData);

    console.log(result);

    Utils.createNotice(`Updated file ${file.name}`);
  }

  private async addFileMapping(googleDriveId: string, path: string) {
    await this.db.localToRemoteKeyMapping.set(path, googleDriveId);

    // #region deprecated
    this.plugin.settings.fileMap[googleDriveId] = path;
    this.plugin.settings.fileReverseMap[path] = googleDriveId;
    await this.plugin.saveSettings();
    // #endregion
  }

  private async deleteFileMapping(path: string) {
    const driveId = this.plugin.settings.fileReverseMap[path];

    delete this.plugin.settings.fileMap[driveId];
    delete this.plugin.settings.fileReverseMap[path];

    await this.plugin.saveSettings();
  }

  private async updateFileMapping(path: string, oldPath: string) {
    const driveId = this.plugin.settings.fileReverseMap[oldPath];

    this.plugin.settings.fileMap[driveId] = path;

    this.plugin.settings.fileReverseMap[path] = driveId;
    delete this.plugin.settings.fileReverseMap[oldPath];
    await this.plugin.saveSettings();
  }

  private getFolderIdFromPath(_filePath: string = "") {
    const filePath = _filePath?.startsWith("/") ? _filePath : "/" + _filePath;

    const pathSplit = filePath.split("/");
    const folderPath = pathSplit.slice(0, pathSplit.length - 1).join("/");

    return this.plugin.settings.fileReverseMap[folderPath || "/"];
  }

  private getFileIdFromPath(_filePath: string = "") {
    const filePath = _filePath?.startsWith("/") ? _filePath : "/" + _filePath;

    return this.plugin.settings.fileReverseMap[filePath || "/"];
  }

  public async trash(x: string) {
    if (!(await this.plugin.app.vault.adapter.trashSystem(x))) {
      await this.plugin.app.vault.adapter.trashLocal(x);
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

    const buffer = await this.plugin.app.vault.adapter.readBinary(key);
    const { id } = await this.googleDriveFiles.create(
      name,
      parentFolderRemoteId,
      buffer
    );

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
      await this.upsertSyncMetaMappingDataByVault({
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

    await this.plugin.app.vault.adapter.writeBinary(localKey, contentBuffer);
  }

  public async createFolderLocal(localKey: string) {
    if (!localKey.endsWith("/")) {
      return;
    }

    const foldersToBuild = Utils.getFolderLevels(localKey);

    for (const folder of foldersToBuild) {
      const r = await this.plugin.app.vault.adapter.exists(folder);

      if (!r) {
        await this.plugin.app.vault.adapter.mkdir(folder);
      }
    }
  }
}
