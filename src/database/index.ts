import {
  FileFolderHistoryRecord,
  SyncMetaMappingRecord,
  TABLE,
} from "../types/database";
import { GoogleSaveDbTable } from "./Table";

export class GoogleSaveDb {
  public readonly fileHistory: GoogleSaveDbTable<FileFolderHistoryRecord>;
  public readonly syncMapping: GoogleSaveDbTable<SyncMetaMappingRecord>;
  public readonly localToRemoteKeyMapping: GoogleSaveDbTable<string>;

  constructor(vaultId?: string) {
    this.fileHistory = new GoogleSaveDbTable<FileFolderHistoryRecord>(
      TABLE.FILE_HISTORY,
      vaultId
    );

    this.syncMapping = new GoogleSaveDbTable<SyncMetaMappingRecord>(
      TABLE.SYNC_MAPPING,
      vaultId
    );

    this.localToRemoteKeyMapping = new GoogleSaveDbTable<string>(
      TABLE.LOCAL_TO_REMOTE,
      vaultId
    );
  }
}
