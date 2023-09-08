import { GoogleDriveFiles } from "../google/GoogleDriveFiles";
import GoogleSavePlugin from "../main";
import { METADATA_FILE } from "../types";
import { FileHandler } from "./FileHandler";

export class FileSync {
  private fileHandler: FileHandler;
  private googleDriveFiles: GoogleDriveFiles

  constructor(
    private readonly plugin: GoogleSavePlugin
  ) {
    this.googleDriveFiles = this.plugin.googleDriveFiles
    this.fileHandler = new FileHandler(this.plugin);
  }

  public async sync() {
    const rootFolderId = this.plugin.settings.fileReverseMap["/"];

    const files = await this.googleDriveFiles.getAllFiles(
      rootFolderId,
      "/"
    );

    console.log(files);
  }

  private async asssembleFileStates() {
    const rootFolderId = this.plugin.settings.fileReverseMap["/"];

    const files = await this.googleDriveFiles.getAllFiles(
      rootFolderId,
      "/"
    );

    for (const remoteFile of files) {

    }
  }

  private isSkippableFile(key: string) {
    if (key === METADATA_FILE) {
      return true;
    }

    return false;
  }
}
