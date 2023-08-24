import { TAbstractFile, TFile, TFolder } from "obsidian";
import { GoogleDriveFiles } from "../google/GogleDriveFiles";
import GoogleSavePlugin from "../main";
import { Utils } from "../shared/utils";

export class FileHandler {
	constructor(
		private readonly plugin: GoogleSavePlugin,
		private readonly googleDriveFiles: GoogleDriveFiles
	) {
		this.plugin.app.workspace.onLayoutReady(() => {
			this.checkRootFolder();
			this.registerVaultEvents();
		});
	}

	private async checkRootFolder() {
		const rootDir =
			this.plugin.settings.rootDir || this.plugin.app.vault.getName();

		const foundFolder = await this.googleDriveFiles.list({
			q: `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${rootDir}'`,
		});

		if (foundFolder.files.length >= 1) {
			if (!this.plugin.settings.fileMap[foundFolder.files[0].id]) {
				this.addFileMapping(foundFolder.files[0].id, "/");
			}

			return;
		}

		const result = await this.googleDriveFiles.createFolder(rootDir);

		const { id } = result;

		this.addFileMapping(id, "/");

		Utils.createNotice("Create root folder");
	}

	private registerVaultEvents() {
		this.plugin.registerEvent(
			this.plugin.app.vault.on(
				"create",
				this.handleCreateEvent.bind(this)
			)
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", async (file) => {
				await this.deleteFileMapping("/" + file.path);
				Utils.createNotice(
					`Delete ${file instanceof TFolder ? "folder" : "file"} ${
						file.name
					}`
				);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on(
				"rename",
				this.handleRenameEvent.bind(this)
			)
		);
	}

	private async handleCreateEvent(file: TFile | TFolder) {
		const isFolder = file instanceof TFolder;

		if (isFolder) {
			const { id } = await this.googleDriveFiles.createFolder(
				file.name,
				this.getFolderIdFromPath(file.path)
			);

			await this.addFileMapping(id, "/" + file.path);

			Utils.createNotice(`Create folder ${file.name}`);

			return;
		}

		const fileData = await this.plugin.app.vault.adapter.readBinary(
			file.path
		);

		const { id } = await this.googleDriveFiles.create(
			file.name,
			this.getFolderIdFromPath(file.path),
			fileData
		);

		await this.addFileMapping(id, "/" + file.path);
		Utils.createNotice(`Create file ${file.name}`);
	}

	private async handleRenameEvent(file: TAbstractFile, oldPath: string) {
		const oldPathSplit = oldPath.split("/");
		const oldFileName = oldPathSplit[oldPathSplit.length - 1];
		const isMovingFile = file.name === oldFileName;

		const fileId = this.getFileIdFromPath(oldPath);

		if (!fileId) {
			Utils.createNotice(`File ${oldPath} not found in mapping`);
		}

		const oldFolderId = this.getFolderIdFromPath(oldPath);
		const newFolderId = this.getFolderIdFromPath(file.path);

		await this.googleDriveFiles.moveOrRenameFile(
			fileId,
			oldFolderId,
			newFolderId,
			file.name
		);

		await this.updateFileMapping("/" + file.path, "/" + oldPath);

		Utils.createNotice(
			`${isMovingFile ? "Moved" : "Renamed"} file ${file.name}`
		);
	}

	private async addFileMapping(googleDriveId: string, path: string) {
		this.plugin.settings.fileMap[googleDriveId] = path;
		this.plugin.settings.fileReverseMap[path] = googleDriveId;
		await this.plugin.saveSettings();
	}

	private async deleteFileMapping(path: string) {
		const driveId = this.plugin.settings.fileReverseMap[path];

		delete this.plugin.settings.fileMap[driveId];
		delete this.plugin.settings.fileReverseMap[path];

		await this.plugin.saveSettings();
	}

	private async updateFileMapping(path: string, oldPath: string) {
		const driveId = this.plugin.settings.fileReverseMap[oldPath];

		this.plugin.settings.fileMap[driveId] = path;

		this.plugin.settings.fileReverseMap[path] = driveId;
		delete this.plugin.settings.fileReverseMap[oldPath];
		await this.plugin.saveSettings();
	}

	private getFolderIdFromPath(_filePath: string = "") {
		const filePath = _filePath?.startsWith("/")
			? _filePath
			: "/" + _filePath;

		const pathSplit = filePath.split("/");
		const folderPath = pathSplit.slice(0, pathSplit.length - 1).join("/");

		return this.plugin.settings.fileReverseMap[folderPath || "/"];
	}

	private getFileIdFromPath(_filePath: string = "") {
		const filePath = _filePath?.startsWith("/")
			? _filePath
			: "/" + _filePath;

		return this.plugin.settings.fileReverseMap[filePath || "/"];
	}
}
