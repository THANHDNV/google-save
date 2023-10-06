import { Plugin, TFile, TFolder, addIcon, setIcon } from "obsidian";
import { GoogleSavePluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaultSetting";
import { GoogleSaveSettingTab } from "./settingTab";
import { GoogleDriveFiles } from "./google/GoogleDriveFiles";
import { FileSync } from "./googleSave/FileSync";
import { GoogleAuth } from "./google/GoogleAuth";
import { GoogleSaveDb } from "./database";
import { v4 as uuid } from "uuid";
import { IconName, LogsIcon, SyncRunningIcon, SyncWaitIcon } from "./icons";
import { SyncTriggerSourceType } from "./types/file";

// Remember to rename these classes and interfaces!

export default class GoogleSavePlugin extends Plugin {
  settings: GoogleSavePluginSettings;
  settingTab: GoogleSaveSettingTab;
  googleDriveFiles: GoogleDriveFiles;
  fileSync: FileSync;
  googleAuth: GoogleAuth;
  db: GoogleSaveDb;
  syncRibbon?: HTMLElement;

  async onload() {
    addIcon(IconName.SYNC_WAIT, SyncWaitIcon);
    addIcon(IconName.SYNC_RUNNING, SyncRunningIcon);
    addIcon(IconName.LOGS, LogsIcon);

    await this.loadSettings();
    await this.generateVaultRandomIdIfNeeded();

    this.googleAuth = new GoogleAuth(this);
    this.db = new GoogleSaveDb(this.settings.vaultId);

    this.settingTab = new GoogleSaveSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.googleDriveFiles = new GoogleDriveFiles(this);

    this.registerObsidianProtocols();

    this.fileSync = new FileSync(this);

    this.syncRibbon = this.addRibbonIcon(
      IconName.SYNC_WAIT,
      `${this.manifest.name}`,
      async () => this.fileSync.sync(SyncTriggerSourceType.MANUAL)
    );

    this.addCommand({
      id: "start-sync",
      name: "Start sync",
      icon: IconName.SYNC_WAIT,
      callback: async () => {
        this.fileSync.sync(SyncTriggerSourceType.MANUAL);
      },
    });
  }

  onunload() {
    this.syncRibbon = undefined;
  }

  public updateSyncRunningStatus() {
    if (this.syncRibbon) {
      setIcon(this.syncRibbon, IconName.SYNC_RUNNING);
    }
  }

  public updateSyncFinishedStatus() {
    if (this.syncRibbon) {
      setIcon(this.syncRibbon, IconName.SYNC_WAIT);
    }
  }

  private registerObsidianProtocols() {
    this.registerObsidianProtocolHandler("googleLogin", (query: any) => {
      this.settingTab.googleAuth.handleLoginResponse({ ...query });
    });
  }

  private async generateVaultRandomIdIfNeeded(): Promise<string> {
    let id = this.settings.vaultId;

    if (!id) {
      id = uuid();
      this.settings.vaultId = id;
      await this.saveSettings();
    }

    return id;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
