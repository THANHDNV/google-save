import { RequestUrlParam, requestUrl } from "obsidian";
import { GoogleAuth } from "./GoogleAuth";
import GoogleSavePlugin from "../main";

const GOOGLE_API = "https://www.googleapis.com/";
const OBSIDIAN_FOLDER = "obsidian-test";

export class GoogleDriveFiles {
	constructor(
		private readonly plugin: GoogleSavePlugin,
		private readonly authClient: GoogleAuth
	) {}

	public async list(query?: Record<string, string>) {
		if (!this.authClient.getAccessToken()) {
			return;
		}

		const { json } = await this.request({
			pathname: `/drive/v3/files`,
			query,
			// body: JSON.stringify(query),
		});

		return json;
	}

	public async create(fileName: string, fileBuffer: ArrayBuffer) {
		if (!this.authClient.getAccessToken()) {
			return;
		}

		const { json } = await this.request({
			pathname: "/drive/v3/files",
			method: "POST",
			body: fileBuffer,
		});

		return json;
	}

	public async createFolder(folderName: string) {
		const mimeType = "application/vnd.google-apps.folder";

		const body = {
			name: folderName,
			mimeType,
		};

		const { json } = await this.request({
			pathname: "/drive/v3/files",
			method: "POST",
			body: JSON.stringify(body),
		});

		return json;
	}

	private async request({
		pathname,
		headers,
		query,
		...params
	}: {
		pathname: string;
		query?: Record<string, string>;
	} & Omit<RequestUrlParam, "url">) {
		const url = new URL(GOOGLE_API);
		url.pathname = pathname;

		if (query) {
			for (const keys in query) {
				url.searchParams.append(keys, query[keys]);
			}
		}

		return requestUrl({
			url: url.toString(),
			headers: {
				Authorization: `Bearer ${await this.authClient.getAccessToken()}`,
				...headers,
			},
			...params,
		});
	}
}
