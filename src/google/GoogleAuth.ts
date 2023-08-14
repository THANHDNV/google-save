export class GoogleAuth {
	public getRefreshToken(): string {
		return window.localStorage.getItem("googleCalendarRefreshToken") ?? "";
	}
}
