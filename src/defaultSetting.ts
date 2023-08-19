import { GoogleSavePluginSettings } from "./types";

export const DEFAULT_SETTINGS: GoogleSavePluginSettings = {
	googleClientId: "",
	googleClientSecret: "",
	googleOauthServer: "https://google-save-server.vercel.app",
	fileMap: {},
	fileReverseMap: {},
};
