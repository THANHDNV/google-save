import { Plugin, TFile, TFolder, addIcon, setIcon } from "obsidian";
import { GoogleSavePluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaultSetting";
import { GoogleSaveSettingTab } from "./settingTab";
import { GoogleDriveFiles } from "./google/GoogleDriveFiles";
import { FileSync } from "./googleSave/FileSync";
import { GoogleAuth } from "./google/GoogleAuth";
import { GoogleSaveDb } from "./database";
import { v4 as uuid } from "uuid";
import {
  IconName,
  LoginIcon,
  LogsIcon,
  RefreshIcon,
  SyncRunningIcon,
  SyncWaitIcon,
} from "./icons";
import { SyncTriggerSourceType } from "./types/file";
import { createNotice } from "./shared/utils";

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
    this.addIcons();

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

    this.addCommands();
  }

  private addIcons() {
    addIcon(IconName.SYNC_WAIT, SyncWaitIcon);
    addIcon(IconName.SYNC_RUNNING, SyncRunningIcon);
    addIcon(IconName.LOGS, LogsIcon);
    addIcon(IconName.LOGIN, LoginIcon);
    addIcon(IconName.REFRESH, RefreshIcon);
  }

  private addCommands() {
    this.addCommand({
      id: "start-sync",
      name: "Start sync",
      icon: IconName.SYNC_WAIT,
      callback: async () => {
        this.fileSync.sync(SyncTriggerSourceType.MANUAL);
      },
    });

    this.addCommand({
      id: "login-logout",
      name: "Login/Logout",
      icon: IconName.LOGIN,
      callback: async () => {
        const isLoggedIn = !!this.googleAuth.getRefreshToken();

        if (isLoggedIn) {
          this.googleAuth.logout();
        } else {
          this.googleAuth.login();
        }

        this.settingTab.display();
      },
    });

    this.addCommand({
      id: "refresh-token",
      name: "Refresh token",
      icon: IconName.REFRESH,
      callback: () => {
        this.googleAuth.refreshAccessToken().then((token) => {
          if (token) {
            createNotice("Refreshed access token");
            return;
          }
          createNotice(
            "Unable to refresh access token. Please try logout and re-login"
          );
        });

        this.settingTab.hide();
        this.settingTab.display();
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
