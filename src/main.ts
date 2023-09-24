import { Plugin, TFile, TFolder } from "obsidian";
import { GoogleSavePluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaultSetting";
import { GoogleSaveSettingTab } from "./settingTab";
import { GoogleDriveFiles } from "./google/GoogleDriveFiles";
import { FileSync } from "./googleSave/FileSync";
import { GoogleAuth } from "./google/GoogleAuth";
import { GoogleSaveDb } from "./database";
import { v4 as uuid } from "uuid";

// Remember to rename these classes and interfaces!

export default class GoogleSavePlugin extends Plugin {
  settings: GoogleSavePluginSettings;
  settingTab: GoogleSaveSettingTab;
  googleDriveFiles: GoogleDriveFiles;
  fileSync: FileSync;
  googleAuth: GoogleAuth;
  db: GoogleSaveDb;

  async onload() {
    await this.loadSettings();
    await this.generateVaultRandomIdIfNeeded();

    this.googleAuth = new GoogleAuth(this);
    this.db = new GoogleSaveDb(this.settings.vaultId);

    // This creates an icon in the left ribbon.
    // const ribbonIconEl = this.addRibbonIcon("dice", "Greet", () => {
    // 	new Notice("Hello world from Google Save");
    // });
    // Perform additional things with the ribbon
    // ribbonIconEl.addClass("my-plugin-ribbon-class");

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    // const statusBarItemEl = this.addStatusBarItem();
    // statusBarItemEl.setText("Status Bar Text");

    // This adds a simple command that can be triggered anywhere
    // this.addCommand({
    // 	id: "open-sample-modal-simple",
    // 	name: "Open sample modal (simple)",
    // 	callback: () => {
    // 		new SampleModal(this.app).open();
    // 	},
    // });
    // This adds an editor command that can perform some operation on the current editor instance
    // this.addCommand({
    // 	id: "sample-editor-command",
    // 	name: "Sample editor command",
    // 	editorCallback: (editor: Editor, view: MarkdownView) => {
    // 		// console.log(editor.getSelection());
    // 		editor.replaceSelection("Sample Editor Command");
    // 	},
    // });
    // This adds a complex command that can check whether the current state of the app allows execution of the command
    // this.addCommand({
    // 	id: "open-sample-modal-complex",
    // 	name: "Open sample modal (complex)",
    // 	checkCallback: (checking: boolean) => {
    // 		// Conditions to check
    // 		const markdownView =
    // 			this.app.workspace.getActiveViewOfType(MarkdownView);
    // 		if (markdownView) {
    // 			// If checking is true, we're simply "checking" if the command can be run.
    // 			// If checking is false, then we want to actually perform the operation.
    // 			if (!checking) {
    // 				new SampleModal(this.app).open();
    // 			}

    // 			// This command will only show up in Command Palette when the check function returns true
    // 			return true;
    // 		}
    // 	},
    // });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.settingTab = new GoogleSaveSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // Using this function will automatically remove the event listener when this plugin is disabled.
    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    // 	console.log("click", evt);
    // });

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    // this.registerInterval(
    // 	window.setInterval(() => {
    // 		console.log("setInterval")
    // 	}, 5 * 60 * 1000)
    // );

    this.googleDriveFiles = new GoogleDriveFiles(this);

    this.registerObsidianProtocols();

    this.fileSync = new FileSync(this);
  }

  onunload() {}

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
