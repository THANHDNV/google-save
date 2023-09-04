import { GoogleDriveFiles } from "../google/GogleDriveFiles";
import GoogleSavePlugin from "../main";
import { METADATA_FILE } from "../types";
import { FileHandler } from "./FileHandler";

export class FileSync {
	private fileHandler: FileHandler;

	constructor(
		private readonly plugin: GoogleSavePlugin,
		private readonly googleDriveFiles: GoogleDriveFiles
	) {
		this.fileHandler = new FileHandler(this.plugin, this.googleDriveFiles);
	}

	public async sync() {
		const rootFolderId = this.plugin.settings.fileReverseMap["/"];

		const files = await this.googleDriveFiles.getAllFiles(
			rootFolderId,
			"/"
		);

		console.log(files);
	}

	private async asssembleFileStates() {
		const rootFolderId = this.plugin.settings.fileReverseMap["/"];

		const files = await this.googleDriveFiles.getAllFiles(
			rootFolderId,
			"/"
		);
	}

	private isSkippableFile(key: string) {
		if (key === METADATA_FILE) {
			return true;
		}

		return false;
	}
}
