import { requestUrl } from "obsidian";
import GoogleSavePlugin from "../main";
import { Utils } from "../shared/utils";
import { GoogleTokenResponse } from "../types/googleAuth";
import { LocalStorageKeys } from "../types/localStorage";

export class GoogleAuth {
	constructor(private readonly plugin: GoogleSavePlugin) {}

	public login() {
		const loginUrl = new URL(this.plugin.settings.googleOauthServer);
		loginUrl.pathname = "/api/google";

		window.open(loginUrl.toString());
	}

	public handleLoginResponse({
		access_token,
		expires_in,
		refresh_token,
	}: GoogleTokenResponse) {
		this.setAccessToken(access_token);
		this.setExpiresIn(this.calculateExpiresAt(Number(expires_in)));
		this.setRefreshToken(refresh_token);

		this.plugin.settingTab.display();
	}

	public handleRefreshResponse({
		access_token,
		expires_in,
	}: Omit<GoogleTokenResponse, "refresh_token">) {
		this.setAccessToken(access_token);
		this.setExpiresIn(this.calculateExpiresAt(Number(expires_in)));
	}

	public logout() {
		window.localStorage.removeItem(LocalStorageKeys.ACCESS_TOKEN);
		window.localStorage.removeItem(LocalStorageKeys.EXPIRES_AT);
		window.localStorage.removeItem(LocalStorageKeys.REFRESH_TOKEN);

		this.plugin.settingTab.display();
	}

	private calculateExpiresAt(expiresIn: number) {
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

	public getRefreshToken(): string | null {
		return window.localStorage.getItem(LocalStorageKeys.REFRESH_TOKEN);
	}

	public async getAccessToken(): Promise<string | null> {
		const isLoggedIn = this.validateIfLoggedIn();

		if (!isLoggedIn) return null;

		let accessToken = this.getAccessTokenIfValid();

		if (!accessToken) {
			accessToken = await this.refreshAccessToken();
		}

		return accessToken;
	}

	public async refreshAccessToken(): Promise<string | null> {
		const refreshToken = this.getRefreshToken();

		if (!refreshToken) return null;

		const refreshUrl = new URL(this.plugin.settings.googleOauthServer);
		refreshUrl.pathname = "/api/google/refresh";
		refreshUrl.searchParams.append("refresh_token", refreshToken);

		const { json: tokenData } = await requestUrl({
			method: "GET",
			url: refreshUrl.toString(),
			headers: { "content-type": "application/json" },
		});

		if (!tokenData) {
			Utils.createNotice("Error while refreshing authentication");
			return null;
		}

		const { access_token, expires_in } = tokenData;

		this.setAccessToken(access_token);
		this.setExpiresIn(this.calculateExpiresAt(Number(expires_in)));

		return access_token;
	}

	private getAccessTokenIfValid(): string | null {
		const expiresAt = this.getExpiresAt();
		const accessToken = window.localStorage.getItem(
			LocalStorageKeys.ACCESS_TOKEN
		);

		// token
		if (!expiresAt || !accessToken) return null;

		if (accessToken === "undefined") return null;

		// token expired
		if (new Date(expiresAt * 1000) <= new Date()) return null;

		return accessToken;
	}

	public getExpiresAt(): number | null {
		const expiresAt = window.localStorage.getItem(
			LocalStorageKeys.EXPIRES_AT
		);

		if (!expiresAt) return null;

		if (Number.isNaN(expiresAt)) return null;

		return Number(expiresAt);
	}

	public validateIfLoggedIn(): boolean {
		const refreshToken = this.getRefreshToken();

		if (!refreshToken) {
			Utils.createNotice("Not yet logged in");
			return false;
		}

		return true;
	}
}
