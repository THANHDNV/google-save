import { FileText, createElement } from "lucide";

const LogsSvg = createElement(FileText);
LogsSvg.setAttribute("width", "100");
LogsSvg.setAttribute("height", "100");

export const LogsIcon = LogsSvg.outerHTML;
