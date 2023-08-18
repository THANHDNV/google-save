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

		new Setting(containerEl).setName("Google Client Id").addText((text) => {
			text.setValue(this.plugin.settings.googleClientId);
		});

		new Setting(containerEl)
			.setName("Google Client Secret")
			.addText((text) => {
				text.setValue(this.plugin.settings.googleClientSecret);
			});

		new Setting(containerEl)
			.setName("Google Client Oauth Server")
			.addText((text) => {
				text.setValue(this.plugin.settings.googleOauthServer);
			});

		new Setting(containerEl)
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
	}
}
