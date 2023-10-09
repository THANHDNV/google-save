export type GoogleSavePluginSettings = {
  googleClientId: string;
  googleClientSecret: string;
  googleOauthServer: string;
  rootDir?: string;
  vaultId?: string;
  autoRunMillisecond?: number;
  autoRunIntervalId?: number;
  initRunAfterMillisecond?: number;
};

export const METADATA_FILE = ".google-save.json";
export const FILE_STAT_SUPPORT_VERSION = "0.13.27";
