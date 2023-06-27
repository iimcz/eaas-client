import { _fetch } from "./util.js";

export class ContainerBuilder {
    constructor(imageSource, urlString, metadata) {
        this.imageUrl = urlString;
        this.name = undefined;
        this.processArgs = null;
        this.processEnvs = null;
        this.inputFolder = "/input";
        this.outputFolder = "/output";
        this.imageType = imageSource;
        this.title = null;
        this.description = null;
        this.author = null;
        this.guiRequired = undefined;
        this.customSubdir = undefined;
        this.runtimeId = undefined;
        this.serviceContainer = false;
        this.enableNetwork = false;
        this.serviceContainerId = undefined;
        this.workingDir = null;
        this.archive = "default";

        if (metadata) {
            this.configureProcess(
                metadata.entryProcesses,
                metadata.envVariables,
            );
            this.setWorkDirectory(metadata.workingDir);
        }
    }

    setName(n) {
        this.name = n;
    }

    setWorkDirectory(d) {
        this.workingDir = d;
    }

    configureProcess(args, envs) {
        this.processArgs = args;
        this.processEnvs = envs;
    }

    setInputFolder(f) {
        this.inputFolder = f;
    }

    setOutputFolder(f) {
        this.outputFolder = f;
    }

    setTitle(t) {
        this.title = t;
    }

    setDescription(d) {
        this.description = d;
    }

    setAuthor(a) {
        this.author = a;
    }

    setRuntime(runtimeId) {
        this.runtimeId = runtimeId;
    }

    enableGui(b) {
        this.guiRequired = b;
    }

    setEnableNetwork(b) {
        this.enableNetwork = b;
    }

    setArchive(a) {
        this.archive = a;
    }

    setServiceContainerId(name) {
        if (name) {
            this.serviceContainer = true;
            this.serviceContainerId = name;
        } else {
            this.serviceContainer = false;
            this.serviceContainerId = undefined;
        }
    }

    async build(api, idToken = null) {
        return await _fetch(
            `${api}EmilContainerData/importContainer`,
            "POST",
            this,
            idToken,
        );
    }
}

export class EmulatorBuilder {
    constructor(url, metadata = null) {
        this.imageUrl = url;
        this.metadata = metadata;
    }

    async build(api, idToken = null) {
        return await _fetch(
            `${api}EmilContainerData/importEmulator`,
            "POST",
            this,
            idToken,
        );
    }
}

export class ContainerImageBuilder {
    constructor(url, containerSource) {
        this.urlString = url;
        this.containerType = containerSource;

        if (
            this.containerType !== "rootfs" &&
            this.containerType !== "simg" &&
            this.containerType !== "dockerhub"
        ) {
            throw new Error(
                `invalid container source '${containerSource}'. valid types are rootfs, simg, dockerhub, readymade`,
            );
        }

        this.tag = undefined;
        this.digest = undefined;
    }

    setTag(tag) {
        this.tag = tag;
    }

    setDigest(d) {
        this.digest = d;
    }

    async build(api, idToken = null) {
        return await _fetch(
            `${api}EmilContainerData/buildContainerImage`,
            "POST",
            this,
            idToken,
        );
    }
}
