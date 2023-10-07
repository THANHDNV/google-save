import { HardDriveUpload, createElement } from "lucide";

const SyncWaitSvg = createElement(HardDriveUpload);
SyncWaitSvg.setAttribute("width", "100");
SyncWaitSvg.setAttribute("height", "100");

export const SyncWaitIcon = SyncWaitSvg.outerHTML;
