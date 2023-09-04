export type GoogleSavePluginSettings = {
	googleClientId: string;
	googleClientSecret: string;
	googleOauthServer: string;
	fileMap: any;
	fileReverseMap: any;
	rootDir?: string;
};

export const METADATA_FILE = ".google-save.json";
