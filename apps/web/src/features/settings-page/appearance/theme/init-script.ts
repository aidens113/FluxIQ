import { themeStorageKey } from "./storage-key";

/** Runs in `<head>` before first paint, so the stored choice shows without a flash. Dark when nothing is stored. */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(themeStorageKey)});document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:"system")}catch(e){document.documentElement.setAttribute("data-theme","system")}`;
