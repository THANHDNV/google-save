import { App, PluginSettingTab, Setting } from "obsidian";
import GoogleSavePlugin from "../main";
import { GoogleAuth } from "../google/GoogleAuth";
import { createNotice } from "../shared/utils";
import { GoogleSavePluginSettings } from "../types";
import { FileSync } from "../googleSave/FileSync";
import { SyncTriggerSourceType } from "../types/file";

export class GoogleSaveSettingTab extends PluginSettingTab {
  public googleAuth: GoogleAuth;
  private readonly fileSync: FileSync;
  private readonly settings: GoogleSavePluginSettings;

  constructor(app: App, private plugin: GoogleSavePlugin) {
    super(app, plugin);

    this.googleAuth = this.plugin.googleAuth;
    this.settings = this.plugin.settings;
    this.fileSync = this.plugin.fileSync;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    const isLoggedIn = !!this.googleAuth.getRefreshToken();

    const GoogleAuthSetting = new Setting(containerEl)
      .setName("Login with Google")
      .addButton((button) => {
        button.setButtonText(isLoggedIn ? "Logout" : "Login").onClick(() => {
          if (isLoggedIn) {
            // do logout
            this.googleAuth.logout();
            return;
          }

          this.googleAuth.login();
        });
      });

    if (isLoggedIn) {
      GoogleAuthSetting.addButton((button) => {
        button.setButtonText("Refresh token").onClick(async () => {
          this.googleAuth.refreshAccessToken().then((token) => {
            if (token) {
              createNotice("Refreshed access token");
              return;
            }
            createNotice(
              "Unable to refresh access token. Please try logout and re-login"
            );
          });

          this.hide();
          this.display();
        });
      });
    }

    if (isLoggedIn) {
      const SyncSetting = new Setting(containerEl).setName("Sync");
      SyncSetting.addButton((button) => {
        button.setButtonText("Sync").onClick(() => {
          this.plugin.fileSync.sync(SyncTriggerSourceType.MANUAL);
        });
      });

      const AutoRunSyncSettings = new Setting(containerEl).setName("Auto-run");
      AutoRunSyncSettings.addDropdown((dropdown) => {
        dropdown.addOption("0", "Disable Auto-run");
        dropdown.addOption(`${1000 * 60 * 1}`, "Auto-run in 1 minute");
        dropdown.addOption(`${1000 * 60 * 5}`, "Auto-run in 5 minutes");
        dropdown.addOption(`${1000 * 60 * 10}`, "Auto-run in 10 minutes");
        dropdown.addOption(`${1000 * 60 * 30}`, "Auto-run in 30 minutes");

        dropdown.setValue(`${this.settings.autoRunMillisecond}`);

        dropdown.onChange(async (value) => {
          const time = parseInt(value);

          if (value) {
            if (
              this.settings.autoRunIntervalId &&
              time !== this.settings.autoRunMillisecond
            ) {
              window.clearTimeout(this.settings.autoRunIntervalId);
            }

            if (time !== this.settings.autoRunMillisecond) {
              this.settings.autoRunIntervalId = window.setInterval(() => {
                this.fileSync.sync(SyncTriggerSourceType.AUTO);
              }, time);
            }
          }

          if (this.settings.autoRunIntervalId) {
            window.clearTimeout(this.settings.autoRunIntervalId);

            delete this.settings.autoRunIntervalId;
          }

          this.settings.autoRunMillisecond = time;
          await this.plugin.saveSettings();
        });
      });

      const RunOnInitSetting = new Setting(containerEl).setName("Run on init");
      RunOnInitSetting.addDropdown((dropdown) => {
        dropdown.addOption("-1", "Disable");
        dropdown.addOption("0", "Run immediately");
        dropdown.addOption(`${1000 * 1}`, "Delay in 1 second");
        dropdown.addOption(`${1000 * 10}`, "Delay in 10 seconds");
        dropdown.addOption(`${1000 * 30}`, "Delay in 30 seconds");

        dropdown.setValue(`${this.settings.initRunAfterMillisecond}`);
        dropdown.onChange(async (value) => {
          const time = parseInt(value);

          this.settings.initRunAfterMillisecond = time;
          await this.plugin.saveSettings();
        });
      });
    }
  }
}
