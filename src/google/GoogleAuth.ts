import GoogleSavePlugin from "../main";
import { GoogleTokenResponse } from "../types/googleAuth";
import { LocalStorageKeys } from "../types/localStorage";

export class GoogleAuth {
	constructor(private readonly plugin: GoogleSavePlugin) {}

	public login() {
		window.open("https://google-save-server.vercel.app/api/google");
	}

	public handleLoginResponse({
		access_token,
		expires_in,
		refresh_token,
	}: GoogleTokenResponse) {
		this.setAccessToken(access_token);
		this.setExpiresIn(this.getExpiresAt(Number(expires_in)));
		this.setRefreshToken(refresh_token);

		this.plugin.settingTab.display();
	}

	public logout() {
		window.localStorage.removeItem(LocalStorageKeys.ACCESS_TOKEN);
		window.localStorage.removeItem(LocalStorageKeys.EXPIRES_AT);
		window.localStorage.removeItem(LocalStorageKeys.REFRESH_TOKEN);

		this.plugin.settingTab.display();
	}

	private getExpiresAt(expiresIn: number) {
		return Math.floor(Date.now() / 1000 + expiresIn - 60);
	}

	public setAccessToken(access_token: string) {
		window.localStorage.setItem(
			LocalStorageKeys.ACCESS_TOKEN,
			access_token
		);
		return access_token;
	}

	public setExpiresIn(expires_at: number) {
		window.localStorage.setItem(
			LocalStorageKeys.EXPIRES_AT,
			expires_at.toString()
		);
		return expires_at;
	}

	public setRefreshToken(refresh_token: string) {
		window.localStorage.setItem(
			LocalStorageKeys.REFRESH_TOKEN,
			refresh_token
		);
		return refresh_token;
	}

	public getRefreshToken(): string {
		return (
			window.localStorage.getItem(LocalStorageKeys.REFRESH_TOKEN) ?? ""
		);
	}
}
