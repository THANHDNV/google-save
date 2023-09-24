import { FileFolderHistoryRecord, TABLE } from "../types/database";
import { GoogleSaveDbTable } from "./Table";

export class GoogleSaveDb {
  public readonly fileHistory: GoogleSaveDbTable<FileFolderHistoryRecord>;

  constructor() {
    this.fileHistory = new GoogleSaveDbTable<FileFolderHistoryRecord>(
      TABLE.FILE_HISTORY
    );
  }
}
