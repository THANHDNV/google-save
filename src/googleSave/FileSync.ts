import { Vault, normalizePath } from "obsidian";
import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { METADATA_FILE } from "../types";
import { FileHandler } from "./FileHandler";
import { FileOrFolderMixedState, RemoteFile } from "../types/file";
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
    await this.asssembleFileStates();
  }

  private async asssembleFileStates() {
    const remoteFiles = await this.getRemote();
    const { remoteStates, metadataFile } = await this.parseRemoteFiles(
      remoteFiles
    );

    const metadataOnRemote = await this.getRemoteMetadataFile(
      metadataFile?.remoteKey
    );

    // const localFiles = await this.getLocal();

    // console.log(remoteFiles);
    // console.log(localFiles);
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
      const fileFullPath = normalizePath(
        `${remoteFile.path}/${remoteFile.name}`
      );

      const file: FileOrFolderMixedState = {
        key: fileFullPath,
        remoteKey: remoteFile.id,
        existRemote: true,
        mtimeRemote: new Date(remoteFile.modifiedTime).getTime(),
        sizeRemote: parseInt(remoteFile.size),
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

    return Promise.all(
      files.map(async (localFile) => ({
        ...localFile,
        ...(await this.vault.adapter.stat(localFile.path)),
      }))
    );
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

  private async assembleMixedStates(): Promise<
    Record<string, FileOrFolderMixedState>
  > {
    return {};
  }

  private isSkippableFile(key: string) {
    if (key === METADATA_FILE) {
      return true;
    }

    return false;
  }
}
