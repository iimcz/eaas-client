class ComponentBuilder {
    constructor() {
        /*
            InputMedium
        */
        this.options = undefined;
    }

    setComponentOptions(options) {
        this.options = options;
    }

    build() {
        if (!this.options) return {};
        let component = {
            options: {
                cpuMillicores: this.options.cpuMillicores,
                memory: this.options.memory,
                userData: this.options.userData,
                timeContext: this.options.timeContext,
            },
        };
        return component;
    }
}

export class ComponentOptions {
    constructor(userData) {
        this.userData = userData;
        this.cpuMillicores = null;
        this.memory = null;
    }

    setUserData(val) {
        this.userData = val;
    }

    setCpu(val) {
        this.cpuMillicores = val;
    }

    setMemory(val) {
        this.memory = val;
    }
}

export class InputBuilder {
    constructor(destination) {
        this.size = 512;
        this.destination = destination;
        this.content = [];
        this.partition_table_type = undefined;
        this.filesystem_type = undefined;
        this.type = undefined;
    }

    setDestination(d) {
        this.destination = d;
    }

    setSize(_size) {
        this.size = _size;
    }

    addContent(c) {
        this.content.push(c);
    }

    build() {
        let input_data = {};
        input_data.size_mb = this.size;
        input_data.destination = this.destination;
        input_data.partition_table_type = this.partition_table_type;
        input_data.filesystem_type = this.filesystem_type;
        input_data.type = this.type;
        input_data.content = this.content;

        input_data.content = [];

        this.content.forEach((element) => {
            input_data.content.push(element.build());
        });

        return input_data;
    }
}

export class InputContentBuilder {
    constructor(url) {
        this.action = "copy";
        this.url = url;
        this.compression_format = "tar";
        this.name = undefined;
    }

    setUrl(_url) {
        this.url = _url;
    }

    setName(_name) {
        this.name = _name;
    }

    setAction(_action) {
        this.action = _action;
    }

    setCompressionFmt(_cFmt) {
        this.compression_format = _cFmt;
    }

    build() {
        let content = {};

        content.action = this.action;
        content.url = this.url;
        content.compression_format = this.compression_format;
        content.name = this.name;

        return content;
    }
}

class DriveDataSource {}

export class ImageDataSource extends DriveDataSource {
    /**
     * @param {string} id
     */
    constructor(id) {
        super();
        this.kind = "image";
        this.id = id;
    }
}

export class ObjectDataSource extends DriveDataSource {
    /**
     * @param {string} id
     * @param {string} archive
     */
    constructor(id, archive = "default") {
        super();
        this.kind = "object";
        this.id = id;
    }
}

export class SoftwareDataSource extends DriveDataSource {
    /**
     * @param {string} id
     */
    constructor(id) {
        super();
        this.kind = "software";
        this.id = id;
    }
}

export class UserMedium extends DriveDataSource {
    /**
     * @param {"hdd" | "cdrom" | "floppy"} mediumType
     * @param {string} url
     * @param {string} name
     */
    constructor(mediumType, url, name = undefined) {
        super();
        this.kind = "user-medium";
    }
}

export class MachineComponentBuilder extends ComponentBuilder {
    constructor(environmentId, imageArchive = null) {
        super();

        this.type = "machine";

        // possible machine component config fields

        // required;
        this.environment = environmentId;

        this.userMedia = undefined;
        this.input_data = [];

        // optional
        this.archive = imageArchive;
        this.inputs = [];

        this.object = undefined;
        this.objectArchive = undefined;

        this.software = undefined;

        // boolean
        this._lockEnvironment = undefined;
        this.emulatorVersion = undefined;
        this.nic = undefined;
        this.linuxRuntimeData = undefined;

        this.keyboardLayout = undefined;
        this.keyboardModel = undefined;

        // ui only settings
        this.interactive = false;

        // for internal use, if network is configure
        this.networkSettings = null;
    }

    addUserMedia(url, mediumType) {
        if (!this.userMedia) this.userMedia = [];

        this.userMedia.push({
            url: url,
            mediumType: mediumType,
        });
    }

    /**
     * @param {number} driveIndex
     * @param {ImageDataSource | ObjectDataSource | SoftwareDataSource | UserMedium} image
     */
    setDriveAssignment(driveIndex, image) {
        if (!this.drives) this.drives = [];

        const drive = {
            id: driveIndex,
            data: image,
        };

        const i = this.drives.findIndex(({ id }) => id === drive.id);
        if (i !== -1) this.drives[i] = drive;
        else this.drives.push(drive);
    }

    getNetworkConfig() {
        return this.networkSettings;
    }

    setNetworkConfig(val) {
        this.networkSettings = val;
        if (val && val.hwAddress != "auto") this.nic = val.hwAddress;
    }

    getId() {
        return this.environment;
    }

    setInteractive(val) {
        this.interactive = val;
    }

    isInteractive() {
        return this.interactive;
    }

    setImageArchive(archive) {
        this.archive = archive;
    }

    addInputMedia(inputMedia) {
        this.input_data.push(inputMedia);
    }

    setObject(objectId, objectArchive) {
        this.object = objectId;
        this.objectArchive = objectArchive;
    }

    setSoftware(software, objectArchive) {
        this.software = software;
        this.objectArchive = objectArchive;
    }

    lockEnvironment(doLock = true) {
        this.lockEnvironment = doLock;
    }

    setEmulatorVersion(emulatorVersion) {
        this.emulatorVersion = emulatorVersion;
    }

    setEthernetAddress(mac) {
        this.nic = mac;
    }

    setRuntime(r) {
        this.linuxRuntimeData = r.build();
    }

    setLinuxRuntime(runtime) {
        if (!runtime) return;

        this.linuxRuntimeData = {
            userContainerEnvironment: runtime.userContainerEnvironment,
            userContainerArchive: runtime.userContainerArchive,
            userEnvironment: runtime.userEnvironment,
            isDHCPenabled: (runtime.networking || {}).isDHCPenabled,
            isTelnetEnabled: (runtime.networking || {}).isTelnetEnabled,
        };

        this.inputs = runtime.input_data;
    }

    setKeyboard(layout, model) {
        this.keyboardLayout = layout;
        this.model = model;
    }

    build() {
        if (!this.environment) {
            throw new Error(
                "Cannot create component request, environmentId is required.",
            );
        }

        let component = {
            type: this.type,
            environment: this.environment,
            userMedia: this.userMedia,
            drives: this.drives,
            archive: this.archive ? this.archive : "default",
            object: this.object,
            objectArchive: this.objectArchive,
            software: this.software,
            lockEnvironment: this._lockEnvironment,
            emulatorVersion: this.emulatorVersion,
            nic: this.nic,
            linuxRuntimeData: this.linuxRuntimeData,
            keyboardLayout: this.keyboardLayout,
            keyboardModel: this.keyboardModel,
        };

        if (this.input_data.length) {
            component.input_data = [];
            this.input_data.forEach((element) => {
                component.input_data.push(element.build());
            });
        } else component.input_data = this.inputs;

        return Object.assign(component, super.build());
    }

    /*
    static async startContainer(api, containerRequest, idToken)
    {
        var data = {};
        data.type = "container";
        data.environment = containerId;
        data.input_data = args.input_data;

        console.log("Starting container " + containerId + "...");
        var deferred = $.Deferred();

        $.ajax({
            type: "POST",
            url: this.API_URL + "/components",
            data: JSON.stringify(data),
            contentType: "application/json",
            headers: localStorage.getItem('id_token') ? { "Authorization": "Bearer " + localStorage.getItem('id_token') } : {}
        }).then((data, status, xhr) => {
            console.log("container " + containerId + " started.");
            this.componentId = data.id;
            this.isStarted = true;
            this.pollStateIntervalId = setInterval(() => { this._pollState(); }, 1500);
            deferred.resolve();
        },
            (xhr) => {
                this._onFatalError($.parseJSON(xhr.responseText));
                deferred.reject();
            });
        return deferred.promise();
    }
    */
}

export class ContainerRuntimeBuilder {
    constructor(envId, archive = "default") {
        this.environmentId = envId;
        this.archive = archive;
        this.isDHCPenabled = false;
        this.isTelnetEnabled = false;
        this.userEnvironment = [];
        this.input = [];
    }

    enableDhcp(b = true) {
        this.isDHCPenabled = b;
    }

    enableTelnet(b = true) {
        this.isTelnetEnabled = b;
    }

    addUserEnvironment(env) {
        this.userEnvironment.push(env);
    }

    build() {
        let linuxRuntimeData = {
            userContainerEnvironment: this.environmentId,
            userContainerArchive: this.archive,
            isDHCPenabled: this.isDHCPenabled,
            isTelnetEnabled: this.isTelnetEnabled,
            userEnvironment: this.userEnvironment,
        };
        return linuxRuntimeData;
    }
}

export class UviMachineComponentBuilder extends MachineComponentBuilder {
    constructor(uvi, environmentId, imageArchive = null) {
        super(environmentId, imageArchive);
        this.type = "uvi";

        this.uviUrl = uvi.url;
        this.uviFilename = uvi.filename;
        this.uviWriteable = uvi.writeable;
        this.auxFiles = uvi.auxFiles;
    }

    build() {
        let component = {
            uviUrl: this.uviUrl,
            uviFilename: this.uviFilename,
            uviWriteable: this.uviWriteable,
            auxFiles: this.auxFiles,
        };

        return Object.assign(component, super.build());
    }
}
