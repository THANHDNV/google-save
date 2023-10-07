import { LogIn, createElement } from "lucide";

const LoginSvg = createElement(LogIn);
LoginSvg.setAttribute("width", "100");
LoginSvg.setAttribute("height", "100");

export const LoginIcon = LoginSvg.outerHTML;
