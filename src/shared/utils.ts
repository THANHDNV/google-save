import { Notice } from "obsidian";
import path from "path";

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

  public static getParentFolder = (a: string) => {
    const b = path.posix.dirname(a);
    if (b === "." || b === "/") {
      // the root
      return "/";
    }
    if (b.endsWith("/")) {
      return b;
    }
    return `${b}/`;
  };
}
