import { FolderSync, createElement } from "lucide";

const SyncRunningSvg = createElement(FolderSync);
SyncRunningSvg.setAttribute("width", "100");
SyncRunningSvg.setAttribute("height", "100");

export const SyncRunningIcon = SyncRunningSvg.outerHTML;
