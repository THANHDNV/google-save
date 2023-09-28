export type GoogleSavePluginSettings = {
  googleClientId: string;
  googleClientSecret: string;
  googleOauthServer: string;
  fileMap: any;
  fileReverseMap: any;
  rootDir?: string;
  vaultId?: string;
};

export const METADATA_FILE = ".google-save.json";
export const FILE_STAT_SUPPORT_VERSION = "0.13.27";
