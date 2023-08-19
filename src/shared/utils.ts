import { Notice } from "obsidian";

export class Utils {
	private static noticeMap: Map<string, moment.Moment> = new Map();

	public static createNotice(text: string, ignoreTimeout = false): void {
		const now = window.moment();

		if (this.noticeMap.has(text)) {
			const lastDisplay = this.noticeMap.get(text);

			if (!lastDisplay || lastDisplay.isBefore(now) || ignoreTimeout) {
				new Notice(text);
				this.noticeMap.set(text, now.add(1, "minute"));
			}
		} else {
			console.log(`[Google Saver] ${text}`);
			new Notice(text);
			this.noticeMap.set(text, now.add(0, "minute"));
		}
	}
}
