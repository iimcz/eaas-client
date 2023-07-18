#!/bin/sh
//bin/sh -c : && exec deno run -A "$0" "$@"

import { clientFromUrl } from "./lib.js";

let [instanceUrl, label, url] = Deno.args;

const client = await clientFromUrl(instanceUrl);
url = String(new URL(encodeURI(url)));

console.log(`Creating ${label} (${url}) in ${client.API_URL}...`);

const { id } = await client.apiFetch("/environment-repository/environments", {
    label: label,
    templateId: "browser",
    nativeConfig: `--disable-background-mode --always-authorize-plugins --allow-outdated-plugins --proxy-server=socks5://127.0.0.1:8090 --window-size=1024,768 ${url}`,
    driveSettings: [],
    operatingSystemId: "os:other:chrome-53",
    enableNetwork: true,
    enableInternet: true,
    useWebRTC: true,
    useXpra: true,
    xpraEncoding: "jpeg",
});
console.log(client.testUrl({ envId: id }));
