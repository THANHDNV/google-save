import { TFile, TFolder, Vault, normalizePath } from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { METADATA_FILE } from "../types";
import { FileHandler } from "./FileHandler";
import {
  AssembleMixedStatesArgs,
  FileOrFolderMixedState,
  GoogleDriveApplicationMimeType,
  RemoteFile,
} from "../types/file";
import { MetadataOnRemote } from "../types/metadata";

export class FileSync {
  private fileHandler: FileHandler;
  private vault: Vault;
  private googleDriveFiles: GoogleDriveFiles;

  constructor(private readonly plugin: GoogleSavePlugin) {
    this.googleDriveFiles = this.plugin.googleDriveFiles;
    this.vault = this.plugin.app.vault;
    this.fileHandler = new FileHandler(this.plugin);
  }

  public async sync() {
    const remoteFiles = await this.getRemote();
    const { remoteStates, metadataFile } = await this.parseRemoteFiles(
      remoteFiles
    );

    const metadataOnRemote = await this.getRemoteMetadataFile(
      metadataFile?.remoteKey
    );

    const localFiles = await this.getLocal();

    console.log(remoteStates);
    console.log(localFiles);
  }

  private async getRemote() {
    const rootDir =
      this.plugin.settings.rootDir || this.plugin.app.vault.getName();

    let rootFolderId = await this.googleDriveFiles.getRootFolder(rootDir);

    if (!rootFolderId) {
      rootFolderId = (await this.googleDriveFiles.createFolder(rootDir))
        .id as string;
    }

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

      const file: FileOrFolderMixedState = {
        key: fileFullPath,
        remoteKey: remoteFile.id,
        existRemote: true,
        mtimeRemote: new Date(remoteFile.modifiedTime).getTime(),
        sizeRemote: isFolder ? 0 : parseInt(remoteFile.size),
      };

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

    // return Promise.all(
    //   files.map(async (localFile) => ({
    //     ...localFile,
    //     ...(await this.vault.adapter.stat(localFile.path)),
    //   }))
    // );
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

    const metadataFileContent = Buffer.from(
      metaDataFileContentArrayBuffer
    ).toString("utf-8");
    const metadataFile = JSON.parse(metadataFileContent) as MetadataOnRemote;

    return metadataFile;
  }

  private async assembleMixedStates({
    remoteFileStates,
    localFiles,
    remoteDeleteFiles,
  }: AssembleMixedStatesArgs): Promise<Record<string, FileOrFolderMixedState>> {
    const result: Record<string, FileOrFolderMixedState> = {};

    for (const remoteFileState of remoteFileStates) {
      const key = remoteFileState.key;
      if (this.isSkippableFile(key)) {
        continue;
      }

      result[key] = remoteFileState;
      result[key].existLocal = false;
    }

    for (const localFile of localFiles) {
      const key = localFile.path;

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
          existLocal: true,
          mtimeLocal,
          sizeLocal: localFile.stat.size,
        };
      }

      if (localFile instanceof TFolder) {
        r = {
          key: `${key}/`,
          existLocal: true,
          sizeLocal: 0,
        };
      }

      if (!r) {
        throw new Error("Unknown file type");
      }

      if (result[key]) {
        result[key] = {
          ...result[key],
          ...r,
        };
      } else {
        result[key] = {
          ...r,
          existRemote: true,
        };
      }

      // result[key] = localFile;
      // result[key].existLocal = true;
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

    return result;
  }

  private isSkippableFile(key: string) {
    if (key === METADATA_FILE) {
      return true;
    }

    return false;
  }
}
