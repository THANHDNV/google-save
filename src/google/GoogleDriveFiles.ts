import { RequestUrlParam, requestUrl } from "obsidian";
import { GoogleAuth } from "./GoogleAuth";
import GoogleSavePlugin from "../main";
import { v4 as uuid } from "uuid";
import { GoogleDriveApplicationMimeType, RemoteFile } from "../types/file";

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
    const mimeType = GoogleDriveApplicationMimeType;

    const body = {
      name: folderName,
      parents: parentId ? [parentId] : undefined,
      mimeType,
    };

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

  public async getAllFiles(
    folderId: string,
    path: string,
    pageToken?: string
  ): Promise<RemoteFile[]> {
    const files: RemoteFile[] = [];

    const query: Record<string, string> = {
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,modifiedTime,size)",
    };

    if (pageToken) {
      query.pageToken = pageToken;
    }

    const { files: filesAndFolders, nextPageToken } = await this.list(query);

    for (const file of filesAndFolders) {
      files.push({
        ...file,
        path,
      });

      if (file.mimeType === GoogleDriveApplicationMimeType) {
        const filesInFolder = await this.getAllFiles(
          file.id,
          (path.endsWith("/") ? path : path + "/") + file.name
        );

        files.push(...filesInFolder);

        continue;
      }
    }

    if (nextPageToken) {
      files.push(...(await this.getAllFiles(folderId, path, nextPageToken)));
    }

    return files;
  }

  public async get(fileId: string, getContent?: boolean): Promise<any> {
    const result = await this.request({
      pathname: `/drive/v3/files/${fileId}`,
      query: getContent ? { alt: "media" } : undefined,
    });

    if (getContent) return result.arrayBuffer;

    return result.json;
  }

  public async getRootFolder(name: string) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) {
      return;
    }

    if (this.rootFolderId) {
      return this.rootFolderId;
    }

    const json = await this.list({
      q: `mimeType='${GoogleDriveApplicationMimeType}' and trashed=false and name='${name}' and 'root' in parents`,
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
