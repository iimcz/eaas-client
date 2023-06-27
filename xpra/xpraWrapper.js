import { baseUrl } from "../base-url.js";
import { once, loadScript, loadStyleSheet } from "../lib/util.js";

// HACK: import.meta.url does not work with webpack
// const baseUrl = new URL("..", import.meta.url);

const WorkerCORS = new Proxy(Worker, {
    construct(target, argArray, newTarget) {
        const scriptURL = argArray[0];
        // TODO: Do not interfere if scriptURL is same-origin
        const patchImportScripts = (scriptURL) => {
            importScripts = new Proxy(importScripts, {
                apply(target, thisArgument, argumentsList) {
                    Reflect.apply(
                        target,
                        thisArgument,
                        argumentsList.map((v) => new URL(v, scriptURL)),
                    );
                },
            });
            importScripts(scriptURL);
        };
        const srcText = `(${patchImportScripts}).apply(undefined, ${JSON.stringify(
            [scriptURL],
        )});`;
        console.debug(srcText);
        const blob = new Blob([srcText]);
        const blobURL = URL.createObjectURL(blob);
        argArray[0] = blobURL;
        return Reflect.construct(target, argArray, newTarget);
    },
});

const xpraPath = new URL("xpra/xpra-html5/html5/", baseUrl);

const WorkerCORS2 = new Proxy(WorkerCORS, {
    construct(target, argArray, newTarget) {
        const [url] = argArray;
        switch (url) {
            case "js/lib/wsworker_check.js":
                argArray[0] = String(
                    new URL("js/lib/wsworker_check.js", xpraPath),
                );
                break;
            case "js/Protocol.js":
                argArray[0] = String(
                    new URL("xpra/eaas-xpra-worker.js", baseUrl),
                );
                break;
        }
        return Reflect.construct(target, argArray, newTarget);
    },
});

export const loadJQuery = async () => {
    if (!globalThis.jQuery)
        await loadScript(new URL("./js/lib/jquery.js", xpraPath));
};

const importXpra = once(async () => {
    Worker = WorkerCORS2;
    await loadJQuery();
    await Promise.all([
        loadScript(new URL("./js/lib/AudioContextMonkeyPatch.js", xpraPath)),
        loadScript(new URL("./js/lib/zlib.js", xpraPath)),
        loadScript(new URL("./js/lib/aurora/aurora.js", xpraPath)),
        loadScript(new URL("./js/lib/lz4.js", xpraPath)),
        loadScript(new URL("./js/lib/brotli_decode.js", xpraPath)),
        loadScript(new URL("./js/lib/jquery-ui.js", xpraPath)),
        loadScript(
            new URL("./js/lib/jquery.ba-throttle-debounce.js", xpraPath),
        ),
    ]);
    // TODO: Performance: Preload these dependencies before the previous `await`
    await Promise.all([
        loadScript(new URL("./js/lib/bencode.js", xpraPath)),
        loadScript(new URL("./js/lib/forge.js", xpraPath)),
        loadScript(new URL("./js/lib/wsworker_check.js", xpraPath)),
        loadScript(new URL("./js/lib/broadway/Decoder.js", xpraPath)),
        loadScript(new URL("./js/lib/aurora/aurora-xpra.js", xpraPath)),
        loadScript(new URL("./js/lib/FileSaver.js", xpraPath)),
        loadScript(new URL("./js/lib/jszip.js", xpraPath)),
        loadScript(new URL("./js/lib/pyrencoder.js", xpraPath)),
        loadScript(new URL("./xpra/eaas-xpra.js", baseUrl)),
        loadScript(new URL("./js/Keycodes.js", xpraPath)),
        loadScript(new URL("./js/Utilities.js", xpraPath)),
        loadScript(new URL("./js/Notifications.js", xpraPath)),
        loadScript(new URL("./js/MediaSourceUtil.js", xpraPath)),
        loadScript(new URL("./js/Window.js", xpraPath)),
        loadScript(new URL("./js/Protocol.js", xpraPath)),
        loadScript(new URL("./js/Client.js", xpraPath)),
        loadScript(new URL("./js/Menu.js", xpraPath)),
        loadScript(new URL("./js/Menu-custom.js", xpraPath)),
    ]);
    // await loadStyleSheet(new URL("./xpra/eaas-xpra.css", baseUrl));
});

export async function prepareAndLoadXpra(xpraUrl, xpraConf) {
    await importXpra();
    return loadXpra(xpraUrl, xpraPath, xpraConf, this);
}
