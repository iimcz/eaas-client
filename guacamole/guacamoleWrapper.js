import { loadScript, loadStyleSheet, once } from "../lib/util.js";
import { jsFiles, cssFiles } from "./file-list.js";

// HACK: import.meta.url does not work with webpack
// const baseUrl = new URL("..", import.meta.url);
import { baseUrl } from "../base-url.js";

const guacamolePath = new URL("guacamole/", baseUrl);

export const importGuacamole = once(async () => {
    await Promise.all([
        ...jsFiles.map((v) => loadScript(new URL(v, guacamolePath))),
        ...cssFiles.map((v) => loadStyleSheet(new URL(v, guacamolePath))),
    ]);
});
