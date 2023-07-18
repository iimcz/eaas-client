#!/bin/sh
//bin/sh -c : && exec deno run -A "$0" "$@"

import { clientFromUrl } from "./lib.js";

let [
    instanceUrl,
    imageUrl = "https://github.com/rafaelgieschke/elephan-dos/raw/main/elephan-dos",
] = Deno.args;

const client = await clientFromUrl(instanceUrl);

const { soundhw = "ac97", memory = "1024" } = Deno.env.toObject();
const label = new URL(imageUrl).pathname.split("/").at(-1);

console.log(`Importing ${imageUrl} to ${client.API_URL}...`);
const { imageId } = await client.createTask(
    "/environment-repository/actions/import-image",
    { label, url: imageUrl },
);
console.log(imageId);

const { id } = await client.apiFetch("/environment-repository/environments", {
    label,
    templateId: "qemu-x86",
    nativeConfig: `-vga cirrus -smp 1 -net nic,model=rtl8139 -soundhw ${soundhw} -m ${memory} -usb -usbdevice tablet`,
    driveSettings: [
        {
            driveIndex: 2,
            imageId,
            imageArchive: "default",
            drive: {
                iface: "ide",
                bus: "0",
                unit: "0",
                type: "disk",
                boot: true,
                plugged: false,
            },
        },
    ],
    operatingSystemId: "os:linux:ubuntu",
    enableNetwork: false,
    enableInternet: false,
    useWebRTC: true,
    useXpra: true,
});
console.log(id);

https: console.log("done importing");
