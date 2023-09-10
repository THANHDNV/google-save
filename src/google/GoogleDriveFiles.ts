import { RequestUrlParam, requestUrl } from "obsidian";
import { GoogleAuth } from "./GoogleAuth";
import GoogleSavePlugin from "../main";
import { v4 as uuid } from "uuid";

const GOOGLE_API = "https://www.googleapis.com/";

export class GoogleDriveFiles {
  private authClient: GoogleAuth;
  private rootFolderId: string;

  constructor(private readonly plugin: GoogleSavePlugin) {
    this.authClient = this.plugin.googleAuth;
  }

  public async list(query?: Record<string, string>) {
    if (!this.authClient.getAccessToken()) {
      return;
    }

    const { json } = await this.request({
      pathname: `/drive/v3/files`,
      query,
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

  public async moveOrRenameFile(
    fileId: string,
    oldFolderId: string,
    newFolderId: string,
    newName: string
  ) {
    const { json } = await this.request({
      pathname: `/drive/v3/files/${fileId}`,
      method: "PATCH",
      query: {
        removeParents: oldFolderId,
        addParents: newFolderId,
      },
      body: JSON.stringify({
        name: newName,
      }),
    });

    return json;
  }

  public async deleteFile(fileId: string) {
    await this.request({
      pathname: `/drive/v3/files/${fileId}`,
      method: "DELETE",
    });
  }

  public async updateFile(fileId: string, fileBuffer: ArrayBuffer) {
    if (!this.authClient.getAccessToken()) {
      return;
    }

    const boundary = uuid();

    const contentType = "application/octet-stream";

    let contentBuffer;

    const body = `--${boundary}\r\ncontent-type: application/json\r\n\r\n${JSON.stringify(
      {
        mimeType: contentType,
      }
    )}\r\n--${boundary}\r\ncontent-type: ${contentType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(
      fileBuffer
    ).toString("base64")}\r\n--${boundary}--`;

    const { json } = await this.request({
      pathname: `/upload/drive/v3/files/${fileId}`,
      method: "PATCH",
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

  public async getAllFiles(folderId: string, path: string, pageToken?: string) {
    const files: {
      id: string;
      mimeType: string;
      name: string;
      path: string;
    }[] = [];

    const query: Record<string, string> = {
      q: `'${folderId}' in parents`,
    };

    if (pageToken) {
      query.pageToken = pageToken;
    }

    const { files: filesAndFolders, nextPageToken } = await this.list(query);

    for (const file of filesAndFolders) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        const filesInFolder = await this.getAllFiles(
          file.id,
          path + "/" + file.name
        );

        files.push({
          ...file,
          path,
        });

        files.push(...filesInFolder);

        continue;
      }

      files.push({
        ...file,
        path,
      });
    }

    return files;
  }

  public async get(
    fileId: string,
    query: Record<string, string> = { fields: "parents" }
  ) {
    const { json } = await this.request({
      pathname: `/drive/v3/files/${fileId}`,
      query,
    });

    return json;
  }

  public async getRootFolder(name: string) {
    if (!this.authClient.getAccessToken()) {
      return;
    }

    if (this.rootFolderId) {
      return this.rootFolderId;
    }

    const { json } = await this.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${name}' and 'root' in parents`,
    });

    if (json.files.length === 0) {
      return;
    }

    this.rootFolderId = json.files[0].id;

    return this.rootFolderId;
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
