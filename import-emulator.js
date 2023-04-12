#!/bin/sh
//bin/sh -c : && exec deno run -A "$0" "$@"

import { getTokenUsingResourceOwnerPassword } from "./eaas-client/lib/oauth-client.js";
import { Client } from "./eaas-client/eaas-client.js";
import { _fetch, Task } from "./eaas-client/lib/util.js";

let [
    instanceUrl,
    imageReference = "registry.gitlab.com/emulation-as-a-service/emulators/qemu-eaas",
] = Deno.args;

const url = new URL(instanceUrl);

let { username, password } = url;
username ||= "admin";
password ||= "admin";

try {
    const repoUrl = new URL(imageReference);
    if (repoUrl.hostname === "gitlab.com") {
        repoUrl.hostname = "registry.gitlab.com";
        const [path, localPart] = repoUrl.pathname.split("/-/");
        repoUrl.pathname = path;
        imageReference = `${repoUrl.host}${repoUrl.pathname}`;
        if (localPart) {
            const branch = localPart.split("/")[1];
            if (branch) imageReference = `${imageReference}:${branch}`;
        }
    }
} catch {}

const [name, tag = "latest"] = imageReference.split(":");

const api = String(
    Object.assign(new URL("/emil", url), { username: "", password: "" }),
);

const createTask = async (client, path, data) => {
    const { taskId } = await _fetch(
        `${client.API_URL}${path}`,
        "POST",
        data,
        client.idToken,
    );
    const task = new Task(taskId, client.API_URL, client.idToken);
    const result = await task.done;
    if (!result.object) return;
    const object = JSON.parse(result.object);
    return object;
};

const { id_token } = await getTokenUsingResourceOwnerPassword({
    issuer: String(new URL("/auth/realms/master", api)),
    username,
    password,
    client_id: "eaas",
});

const client = new Client(api, id_token, { emulatorContainer: {} });

console.log(`Importing ${name}:${tag} to ${api}...`);
const { containerUrl, metadata } = await createTask(
    client,
    "/EmilContainerData/buildContainerImage",
    { urlString: name, tag, containerType: "dockerhub" },
);
console.log(containerUrl, metadata);

await createTask(client, "/EmilContainerData/importEmulator", {
    imageUrl: containerUrl,
    metadata,
});
console.log("done importing");
