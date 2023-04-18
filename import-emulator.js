#!/bin/sh
//bin/sh -c : && exec deno run -A "$0" "$@"

import { clientFromUrl } from "./lib.js";

let [
    instanceUrl,
    imageReference = "registry.gitlab.com/emulation-as-a-service/emulators/qemu-eaas",
] = Deno.args;

const client = await clientFromUrl(instanceUrl);

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
const digest = imageReference.split("@").at(2);

console.log(`Importing ${name}:${tag} to ${client.API_URL}...`);
const { containerUrl, metadata } = await client.createTask(
    "/EmilContainerData/buildContainerImage",
    { urlString: name, tag, digest, containerType: "dockerhub" },
);
console.log(containerUrl, metadata);

await client.createTask("/EmilContainerData/importEmulator", {
    imageUrl: containerUrl,
    metadata,
});
console.log("done importing");
