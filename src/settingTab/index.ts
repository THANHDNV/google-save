import { App, PluginSettingTab, Setting } from "obsidian";
import GoogleSavePlugin from "../main";
import { GoogleAuth } from "../google/GoogleAuth";

export class GoogleSaveSettingTab extends PluginSettingTab {
	private plugin: GoogleSavePlugin;
	public googleAuth: GoogleAuth;

	constructor(app: App, plugin: GoogleSavePlugin) {
		super(app, plugin);

		this.plugin = plugin;
		this.googleAuth = new GoogleAuth(plugin);
	}

	display() {
		const { containerEl } = this;

		containerEl.empty();

		const isLoggedIn = !!this.googleAuth.getRefreshToken();

		const GoogleAuthSetting = new Setting(containerEl)
			.setName("Login with Google")
			.addButton((button) => {
				button
					.setButtonText(isLoggedIn ? "Logout" : "Login")
					.onClick(() => {
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
					this.googleAuth.refreshAccessToken();

					this.hide();
					this.display();
				});
			});
		}
	}
}
