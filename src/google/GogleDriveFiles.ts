import { RequestUrlParam, arrayBufferToBase64, requestUrl } from "obsidian";
import { GoogleAuth } from "./GoogleAuth";
import GoogleSavePlugin from "../main";
import { v4 as uuid } from "uuid";

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

	public async create(
		fileName: string,
		parentId: string,
		fileBuffer: ArrayBuffer
	) {
		if (!this.authClient.getAccessToken()) {
			return;
		}

		const boundary = uuid();

		const contentType = "application/octet-stream";

		const body = `--${boundary}\r\ncontent-type: application/json\r\n\r\n${JSON.stringify(
			{
				name: fileName,
				parents: [parentId],
				mimeType: contentType,
			}
		)}\r\n--${boundary}\r\ncontent-type: ${contentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(
			fileBuffer
		).toString("base64")}\r\n--${boundary}--`;

		const { json } = await this.request({
			pathname: "/upload/drive/v3/files",
			method: "POST",
			headers: {
				"Content-Type": `multipart/related; boundary=${boundary}`,
			},
			query: {
				uploadType: "multipart",
			},
			body,
		});

		return json;
	}

	public async createFolder(folderName: string, parentId?: string) {
		const mimeType = "application/vnd.google-apps.folder";

		const body = {
			name: folderName,
			parents: parentId ? [parentId] : undefined,
			mimeType,
		};

		console.log(body);

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
