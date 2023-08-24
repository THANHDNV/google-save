import { Plugin, TFile, TFolder } from "obsidian";
import { GoogleSavePluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaultSetting";
import { GoogleSaveSettingTab } from "./settingTab";
import { GoogleDriveFiles } from "./google/GogleDriveFiles";
import { Utils } from "./shared/utils";

// Remember to rename these classes and interfaces!

export default class GoogleSavePlugin extends Plugin {
	settings: GoogleSavePluginSettings;
	settingTab: GoogleSaveSettingTab;
	googleDriveFiles: GoogleDriveFiles;

	async onload() {
		await this.loadSettings();

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

		this.googleDriveFiles = new GoogleDriveFiles(
			this,
			this.settingTab.googleAuth
		);

		this.registerObsidianProtocols();

		this.app.workspace.onLayoutReady(() => {
			this.checkRootFolder();
			this.registerVaultEvents();
		});
	}

	onunload() {}

	private async checkRootFolder() {
		const rootDir = this.settings.rootDir || this.app.vault.getName();

		const foundFolder = await this.googleDriveFiles.list({
			q: `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${rootDir}'`,
		});

		if (foundFolder.files.length >= 1) {
			if (!this.settings.fileMap[foundFolder.files[0].id]) {
				this.addFileMapping(foundFolder.files[0].id, "/");
			}

			return;
		}

		const result = await this.googleDriveFiles.createFolder(rootDir);

		const { id } = result;

		this.addFileMapping(id, "/");
		this.saveSettings();

		Utils.createNotice("Create root folder");
	}

	private registerVaultEvents() {
		this.registerEvent(
			this.app.vault.on("create", async (file: TFile | TFolder) => {
				const isFolder = file instanceof TFolder;

				if (isFolder) {
					const { id } = await this.googleDriveFiles.createFolder(
						file.name,
						this.getFolderIdFromPath(file.path)
					);

					this.addFileMapping(id, "/" + file.path);

					Utils.createNotice(`Create folder ${file.name}`);

					return;
				}

				const fileData = await this.app.vault.adapter.readBinary(
					file.path
				);

				const { id } = await this.googleDriveFiles.create(
					file.name,
					this.getFolderIdFromPath(file.path),
					fileData
				);

				Utils.createNotice(`Create file ${file.name}`);

				this.addFileMapping(id, "/" + file.path);
			})
		);

		this.registerEvent(this.app.vault.on("modify", (file) => {}));

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.deleteFileMapping("/" + file.path);
				Utils.createNotice(
					`Delete ${file instanceof TFolder ? "folder" : "file"} ${
						file.name
					}`
				);
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				console.log("rename", file.name, file.path);
			})
		);
	}

	private registerObsidianProtocols() {
		this.registerObsidianProtocolHandler("googleLogin", (query: any) => {
			this.settingTab.googleAuth.handleLoginResponse({ ...query });
		});
	}

	private addFileMapping(googleDriveId: string, path: string) {
		this.settings.fileMap[googleDriveId] = path;
		this.settings.fileReverseMap[path] = googleDriveId;
		this.saveSettings();
	}

	private deleteFileMapping(path: string) {
		const driveId = this.settings.fileReverseMap[path];

		delete this.settings.fileMap[driveId];
		delete this.settings.fileReverseMap[path];

		this.saveSettings();
	}

	private getFolderIdFromPath(_filePath: string = "") {
		const filePath = _filePath?.startsWith("/")
			? _filePath
			: "/" + _filePath;

		const pathSplit = filePath.split("/");
		const folderPath = pathSplit.slice(0, pathSplit.length - 1).join("/");

		return this.settings.fileReverseMap[folderPath || "/"];
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
