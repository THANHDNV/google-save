import { App, PluginSettingTab, Setting } from "obsidian";
import GoogleSavePlugin from "../main";
import { GoogleAuth } from "../google/GoogleAuth";
import { Utils } from "../shared/utils";

export class GoogleSaveSettingTab extends PluginSettingTab {
  public googleAuth: GoogleAuth;

  constructor(app: App, private plugin: GoogleSavePlugin) {
    super(app, plugin);

    this.googleAuth = this.plugin.googleAuth;
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
              Utils.createNotice("Refreshed access token");
              return;
            }
            Utils.createNotice(
              "Unable to refresh access token. Please try logout and re-login"
            );
          });

          this.hide();
          this.display();
        });
      });
    }

    if (isLoggedIn) {
      new Setting(containerEl).addButton((button) => {
        button.setButtonText("Sync").onClick(() => {
          this.plugin.fileSync.sync();
        });
      });
    }
  }
}
