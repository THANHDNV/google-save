import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import GoogleSavePlugin from "../main";

export class GoogleSaveSettingTab extends PluginSettingTab {
	plugin: GoogleSavePlugin;

	constructor(app: App, plugin: GoogleSavePlugin) {
		super(app, plugin);

		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;

		containerEl.empty();

		let isLoggedIn = false;

		new Setting(containerEl)
			.setName("Login with Google")
			.addButton((button) => {
				button
					.setButtonText(isLoggedIn ? "Logout" : "Login")
					.onClick(() => {
						if (isLoggedIn) {
							// logout logic
							return;
						}

						// login logic
					});
			});

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
	}
}
