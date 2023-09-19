import { TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { Utils } from "../shared/utils";
import { GoogleDriveApplicationMimeType } from "../types/file";

export class FileHandler {
  private googleDriveFiles: GoogleDriveFiles;

  constructor(private readonly plugin: GoogleSavePlugin) {
    this.googleDriveFiles = this.plugin.googleDriveFiles;

    this.plugin.app.workspace.onLayoutReady(() => {
      this.checkRootFolder();
      this.registerVaultEvents();
    });
  }

  private async checkRootFolder() {
    const rootDir =
      this.plugin.settings.rootDir || this.plugin.app.vault.getName();

    const foundFolder = await this.googleDriveFiles.list({
      q: `mimeType='${GoogleDriveApplicationMimeType}' and trashed=false and name='${rootDir}' and 'root' in parents`,
    });

    if (foundFolder.files.length >= 1) {
      if (!this.plugin.settings.fileMap[foundFolder.files[0].id]) {
        this.addFileMapping(foundFolder.files[0].id, "/");
      }

      return;
    }

    const result = await this.googleDriveFiles.createFolder(rootDir);

    const { id } = result;

    this.addFileMapping(id, "/");

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
    this.plugin.settings.fileMap[googleDriveId] = path;
    this.plugin.settings.fileReverseMap[path] = googleDriveId;
    await this.plugin.saveSettings();
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
}
