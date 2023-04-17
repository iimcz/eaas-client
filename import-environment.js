#!/bin/sh
//bin/sh -c : && exec deno run -A "$0" "$@"

import { getTokenUsingResourceOwnerPassword } from "./eaas-client/lib/oauth-client.js";
import { Client } from "./eaas-client/eaas-client.js";
import { _fetch, Task } from "./eaas-client/lib/util.js";

let [
    instanceUrl,
    imageUrl = "https://github.com/rafaelgieschke/elephan-dos/raw/main/elephan-dos",
] = Deno.args;

const { soundhw = "ac97", memory = "1024" } = Deno.env.toObject();

const label = new URL(imageUrl).pathname.split("/").at(-1);

const url = new URL(instanceUrl);

let { username, password } = url;
username ||= "admin";
password ||= "admin";

const api = String(
    Object.assign(new URL("/emil", url), { username: "", password: "" }),
);

const apiFetch = async (client, path, data, method = "POST") => {
    return await _fetch(
        `${client.API_URL}${path}`,
        "POST",
        data,
        client.idToken,
    );
};

const createTask = async (client, path, data) => {
    const { taskId } = await apiFetch(client, path, data);
    const task = new Task(taskId, client.API_URL, client.idToken);
    const result = await task.done;
    if (result.object) {
        const object = JSON.parse(result.object);
        return object;
    }
    if (result.userData) return result.userData;
};

const { id_token } = await getTokenUsingResourceOwnerPassword({
    issuer: String(new URL("/auth/realms/master", api)),
    username,
    password,
    client_id: "eaas",
});

const client = new Client(api, id_token, { emulatorContainer: {} });

console.log(`Importing ${imageUrl} to ${api}...`);
const { imageId } = await createTask(
    client,
    "/environment-repository/actions/import-image",
    { label, url: imageUrl },
);
console.log(imageId);

const { id } = await apiFetch(client, "/environment-repository/environments", {
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
