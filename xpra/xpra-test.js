import { prepareAndLoadXpra } from "./xpraWrapper.js";

(async () => {
    const { ssl, server, port } = Object.fromEntries(
        new URL(location).searchParams,
    );
    const url = new URL("https://invalid/");
    url.protocol = ssl === "true" ? "wss" : "ws";
    url.host = server;
    url.port = port;
    console.log(url);
    const client = await prepareAndLoadXpra.call({}, String(url), {
        pointerLock: true,
        debugLogPackets: true,
    });
    globalThis.client = client;
    client.eaasFirstWindow.then(
        () => (document.body.style.backgroundColor = "green"),
    );
})();
