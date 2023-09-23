import { FileFolderHistoryRecord, TABLE } from "../types/database";
import { GoogleSaveDbTable } from "./Table";

export class GoogleSaveDb {
  private readonly fileHistory: GoogleSaveDbTable;

  constructor() {
    this.fileHistory = new GoogleSaveDbTable<FileFolderHistoryRecord>(
      TABLE.FILE_HISTORY
    );
  }
}
