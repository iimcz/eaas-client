import { _fetch, ClientError, requestPointerLock, Task } from "./util.js";
import EventTarget from "../third_party/event-target/esm/index.js";

import { loadJQuery, prepareAndLoadXpra } from "../xpra/xpraWrapper.js";
import { importGuacamole } from "../guacamole/guacamoleWrapper.js";

import "./streams-polyfill.js";

export class ComponentSession extends EventTarget {
    constructor(api, environmentId, componentId, idToken = null) {
        super();

        this.API_URL = api;
        this.idToken = idToken;
        this.environmentId = environmentId;
        this.componentId = componentId;
        this.removableMediaList = null;

        this.request = null;

        this.eventSource = null;
        this.params = null;
        this.isConnected = false;
        this.ethernetConnectorUrl = null;
        this.connectViewerFunc = null;
        this.connectViewerUrl = null;
        this.viewerInstance = null;
        this.connectAudioUrl = null;

        this.stdOutLog = "";
        this.stdErrLog = "";

        this.hasNetworkSession = false;
        this.released = false;
        this.emulatorState = undefined;

        this.network = undefined;

        let eventUrl =
            this.API_URL + "/components/" + this.componentId + "/events";
        if (idToken) {
            // TODO: idToken() might return a `Promise`
            // (which cannot be awaited in a constructor).
            const access_token =
                typeof idToken === "function" ? idToken() : idToken;
            eventUrl += `?${new URLSearchParams({ access_token })}`;
        }

        this.eventSource = new EventSource(eventUrl);
        this.isStarted = true;
    }

    static async createComponent(componentRequest, api, idToken) {
        try {
            let result = await _fetch(
                `${api}/components`,
                "POST",
                componentRequest.build(),
                idToken,
            );
            let component = new ComponentSession(
                api,
                componentRequest.environment,
                result.id,
                idToken,
            );
            component.setRemovableMediaList(result.removableMediaList);
            component.setSessionRequestInfo(componentRequest);
            console.log(
                "Environment " + componentRequest.environment + " started.",
            );
            await component._getControlUrl();
            return component;
        } catch (error) {
            throw new ClientError(
                "Starting server-side component failed!",
                error,
            );
        }
    }

    setNetwork(network) {
        this.network = network;
    }

    getId() {
        return this.componentId;
    }

    setSessionRequestInfo(req) {
        this.request = req;
    }

    getNetwork() {
        return this.network;
    }

    hasSharedNetworkPorts() {
        if (!this.network) return false;

        let config = this.network.getNetworkConfig(this.componentId);
        if (!config) return false;

        let configuredPorts = config.serverPorts;
        if (!configuredPorts || configuredPorts.length < 1) return false;

        if (!config.fqdn && !config.serverIp) return false;

        return true;
    }

    async getProxyURL({
        serverIp = null,
        serverPort = null,
        gatewayIP = "dhcp",
        localPort = "8080",
        localIP = "127.0.0.1",
    } = {}) {
        if (!this.network) {
            throw new Error("This component is not part of a network");
        }

        let config = this.network.getNetworkConfig(this.componentId);
        if (!config) {
            throw new Error("This component has no network configurations");
        }

        let configuredPorts = config.serverPorts;
        if (!configuredPorts || configuredPorts.length < 1) {
            throw new Error("No public port configured");
        }

        if (serverPort && !configuredPorts.contains(serverPort)) {
            throw new Error(
                "Server port " +
                    serverPort +
                    "not configured. Configured ports " +
                    configuredPorts.toString(),
            );
        }

        if (!serverPort) serverPort = configuredPorts[0];

        if (!serverIp) serverIp = config.fqdn;

        if (!serverIp) serverIp = config.serverIp;

        if (!serverIp || !serverPort) {
            throw Error(
                "TCP gateway is not configured: target IP:PORT is required",
            );
        }

        return this._getProxyURLRaw({
            serverIp,
            serverPort,
            gatewayIP,
            localPort,
            localIP,
        });
    }

    async _getProxyURLRaw({
        serverIp,
        serverPort,
        gatewayIP,
        localPort,
        localIP,
    }) {
        const eaasURL = new URL("web+eaas-proxy:");
        eaasURL.search = encodeURIComponent(
            JSON.stringify([
                `${localIP}:${localPort}`,
                await this.network.wsConnection(),
                "",
                gatewayIP,
                serverIp,
                serverPort,
            ]),
        );
        return String(eaasURL);
    }

    hasPointerLock() {
        return this.params && this.params.pointerLock === "true";
    }

    setPointerLock() {
        if (this.params && this.params.pointerLock === "true") {
            if (this.viewMode === "guac") {
                requestPointerLock(
                    this.viewerInstance.getDisplay().getElement(),
                    "click",
                );
            }
        }
    }

    setRemovableMediaList(mediaList) {
        this.removableMediaList = mediaList;
    }

    getRemovableMediaList() {
        return this.removableMediaList;
    }

    /**
     * Create a new derivate
     *
     * @param {SnapshotRequestBuilder} snapshotRequest
     * @param networkEnvironmentId
     * @return
     */
    async createSnapshot(snapshotRequest) {
        let postReq = snapshotRequest;
        postReq.envId = this.environmentId;
        if (this.request) {
            if (this.request.object) postReq.objectId = this.request.object;

            if (this.request.software) {
                postReq.softwareId = this.request.software;
            }
        }

        let taskId = await _fetch(
            `${this.API_URL}/components/${this.componentId}/async/snapshot`,
            "POST",
            postReq,
            this.idToken,
        );
        let task = new Task(taskId.taskId, this.API_URL, this.idToken);
        let result = await task.done;

        if (result.status === "1") {
            throw new Error("failed creating snapshot: " + result.message);
        }

        let payload = JSON.parse(result.object);
        return payload.envId;
    }

    /**
     * Create a new derivate
     *
     * @deprecated
     */
    async snapshot(postObj, networkEnvironmentId) {
        postObj.envId = this.environmentId;

        let result = await _fetch(
            `${this.API_URL}/components/${this.componentId}/snapshot`,
            "POST",
            postObj,
            this.idToken,
        );

        if (result.status === "1") {
            throw new Error("failed creating snapshot: " + result.message);
        }

        if (this.network && networkEnvironmentId) {
            this.network.updateNetwork(
                networkEnvironmentId,
                this.environmentId,
                result.envId,
            );
        }

        return result;
    }

    async changeMedia(postObj) {
        return _fetch(
            `${this.API_URL}/components/${this.componentId}/changeMedia`,
            "POST",
            postObj,
            this.idToken,
        );
    }

    _strParamsToObject(str) {
        var result = {};
        if (!str) return result; // return on empty string

        str.split("&").forEach(function (part) {
            var item = part.split("=");
            result[item[0]] = decodeURIComponent(item[1]);
        });

        return result;
    }

    async _getControlUrl() {
        try {
            let result = await _fetch(
                `${this.API_URL}/components/${this.componentId}/controlurls`,
                "GET",
                undefined,
                this.idToken,
            );

            console.log(result);

            // Get the first ws+ethernet connector
            const entries = Object.entries(result).filter(([k]) =>
                k.match(/^ws\+ethernet\+/),
            );
            if (entries.length) this.ethernetConnectorURL = entries[0][1];

            // Guacamole connector?
            if (result.guacamole) {
                this.connectViewerUrl = result.guacamole;
                this.connectViewerFunc = this._establishGuacamoleTunnel;
                this.params = this._strParamsToObject(
                    result.guacamole.substring(
                        result.guacamole.indexOf("#") + 1,
                    ),
                );
                this.viewMode = "guac";
            } // XPRA connector
            else if (result.xpra) {
                this.connectViewerUrl = result.xpra;
                this.connectViewerFunc = prepareAndLoadXpra;
                this.params = this._strParamsToObject(
                    result.xpra.substring(result.xpra.indexOf("#") + 1),
                );
                this.viewMode = "xpra";
            }

            if (typeof result.audio !== "undefined") {
                this.connectAudioUrl = result.audio;
            }

            /*
            // WebEmulator connector
            else if (result.webemulator) {
                controlUrl = encodeURIComponent(JSON.stringify(result));
                this.params = strParamsToObject(result.webemulator.substring(result.webemulator.indexOf("#") + 1));
                connectViewerFunc = this._prepareAndLoadWebEmulator;
            }
            */

            /*
            if (result.stdout) {
                const session = this;
                (await fetch(result.stdout)).body.pipeThrough(new TextDecoderStream()).pipeTo(new WritableStream({write(v) {
                    console.log(session.componentId + " " + v);

                    // session.stdOutLog += v;
                    // session.dispatchEvent(new CustomEvent("stdout",
                    //    {
                    //        detail: v
                    //    }
                    // ));

                }}));
            }

            if (result.stderr) {
                const session = this;
                (await fetch(result.stderr)).body.pipeThrough(new TextDecoderStream()).pipeTo(new WritableStream({write(v) {
                    console.log(session.componentId + " " + v);

                //    session.stdErrLog += v;
                //    session.dispatchEvent(new CustomEvent("stderr", {
                //        detail: v
                //    }));

                }}));
            }
            */
        } catch (e) {
            console.trace();
            throw new Error(e);
        }
    }

    async keepalive() {
        if (this.network && !this.forceKeepalive) {
            // if part of an network, network session will take care
            return;
        }

        const url = `${this.API_URL}/components/${this.componentId}/keepalive`;
        _fetch(url, "POST", null, this.idToken);
    }

    async getEmulatorState() {
        if (this.isStarted) {
            return _fetch(
                `${this.API_URL}/components/${this.componentId}/state`,
                "GET",
                null,
                this.idToken,
            );
        } else return null;
    }

    async connect(container, viewerData) {
        this.container = container;
        if (!this.connectViewerFunc) {
            console.log("no viewer connection available");
            return;
        }

        viewerData.pointerLock = this.params.pointerLock === "true";

        // Establish the connection
        this.viewerInstance = await this.connectViewerFunc.call(
            this,
            this.connectViewerUrl,
            viewerData,
        );
        console.log("Viewer connected successfully.");
        console.log(this.viewerInstance);
        this.isConnected = true;

        if (this.connectAudioUrl) this._initWebRtcAudio(this.connectAudioUrl);
    }

    disconnect() {
        if (!this.isConnected) return;

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = undefined;
        }

        console.log("Disconnecting viewer...");
        if (this.viewMode === "guac") {
            this.viewerInstance.disconnect();
            BWFLA.unregisterEventCallback(
                this.viewerInstance.getDisplay(),
                "resize",
                this._onResize.bind(this),
            );
            var element = this.viewerInstance.getDisplay().getElement();
            $(element).remove();
        } else if (this.viewMode === "xpra") {
            this.viewerInstance.close();
        }

        if (this.rtcPeerConnection != null) this.rtcPeerConnection.close();

        $(this.container).empty();
        this.container = undefined;
        this.isConnected = false;
    }

    async stop() {
        let res = _fetch(
            `${this.API_URL}/components/${this.componentId}/stop`,
            "GET",
            null,
            this.idToken,
        );
        this.isStarted = false;
        return res;
    }

    async release() {
        if (!this.componentId) return;

        if (this.network) {
            // network session takes care
            return;
        }

        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = undefined;
        }

        _fetch(
            `${this.API_URL}/components/${this.componentId}`,
            "DELETE",
            null,
            this.idToken,
        );
        this.componentId = undefined;
    }

    async getContainerResultUrl() {
        if (this.componentId == null) {
            throw new Error(
                "Component ID is null, please contact administrator",
            );
        }

        return _fetch(
            `${this.API_URL}/components/${this.componentId}/result`,
            "GET",
            null,
            this.idToken,
        );
    }

    /**
     * Checkpoints a running session
     */
    async checkpoint() {
        let result;
        if (!this.isStarted) {
            throw new Error("Environment is stopped!");
        }

        if (this.network) {
            // Remove the main component from the network group first!
            await this.network.disconnect(this.componentId);
        }

        const postReq = {
            envId: this.environmentId,
            type: "newEnvironment",
        };

        try {
            console.log("Checkpointing session...");

            let taskId = await _fetch(
                `${this.API_URL}/components/${this.componentId}/async/checkpoint`,
                "POST",
                postReq,
                this.idToken,
            );
            let task = new Task(taskId.taskId, this.API_URL, this.idToken);
            result = await task.done;

            if (result.status === "1") throw new Error(result.message);
        } catch (e) {
            console.log(e);
            if (this.network) {
                await this.network.release();
            }
            throw e;
        }

        if (this.network) {
            await this.network.release();
        }

        let payload = JSON.parse(result.object);
        console.log("Checkpoint created: " + payload.envId);
        return payload.envId;
    }

    downloadPrint(label) {
        return `${this.API_URL}/components/${
            this.componentId
        }/downloadPrintJob?${new URLSearchParams({ label })}`;
    }

    async getPrintJobs() {
        return _fetch(
            `${this.API_URL}/components/${this.componentId}/printJobs`,
            "GET",
            null,
            this.idToken,
        );
    }

    async _establishGuacamoleTunnel(controlUrl) {
        await importGuacamole();
        // TODO: Remove direct jQuery dependencies from eaas-client
        await loadJQuery();
        $.fn.focusWithoutScrolling = function () {
            var x = window.scrollX,
                y = window.scrollY;
            this.focus();
            window.scrollTo(x, y);
            return this;
        };

        // Remove old display element, if present
        if (this.viewerInstance) {
            var element = this.viewerInstance.getDisplay().getElement();
            $(element).remove();
        }

        const guac = new Guacamole.Client(
            new Guacamole.HTTPTunnel(controlUrl.split("#")[0]),
        );
        var displayElement = guac.getDisplay().getElement();

        guac.onerror = function (status) {
            console.log(
                "GUAC-ERROR-RESPONSE:",
                status.code,
                " -> ",
                status.message,
            );
        };

        hideClientCursor(guac);
        this.container.insertBefore(displayElement, this.container.firstChild);

        BWFLA.registerEventCallback(
            guac.getDisplay(),
            "resize",
            this._onResize.bind(this),
        );
        guac.connect();

        var mouse = new Guacamole.Mouse(displayElement);
        var touch = new Guacamole.Mouse.Touchpad(displayElement);
        var mousefix = new BwflaMouse(guac);

        //touch.onmousedown = touch.onmouseup = touch.onmousemove =
        //mouse.onmousedown = mouse.onmouseup = mouse.onmousemove =
        //function(mouseState) { guac.sendMouseState(mouseState); };

        mouse.onmousedown = touch.onmousedown = mousefix.onmousedown;
        mouse.onmouseup = touch.onmouseup = mousefix.onmouseup;
        mouse.onmousemove = touch.onmousemove = mousefix.onmousemove;

        var keyboard = new Guacamole.Keyboard(displayElement);

        keyboard.onkeydown = function (keysym) {
            guac.sendKeyEvent(1, keysym);
        }.bind(this);
        keyboard.onkeyup = function (keysym) {
            guac.sendKeyEvent(0, keysym);
        }.bind(this);

        $(displayElement).attr("tabindex", "0");
        $(displayElement).css("outline", "0");
        $(displayElement).mouseenter(function () {
            $(this).focusWithoutScrolling();
        });

        if (this.onReady) {
            this.onReady();
        }

        return guac;
    }

    _prepareAndLoadWebEmulator(url) {
        /*
         search for eaas-client.js path, in order to include it to filePath
         */
        var scripts = document.getElementsByTagName("script");
        var eaasClientPath = "";
        var searchingAim = "eaas-client.js";
        for (var prop in scripts) {
            if (
                typeof scripts[prop].src != "undefined" &&
                scripts[prop].src.indexOf(searchingAim) != -1
            ) {
                eaasClientPath = scripts[prop].src;
            }
        }
        var webemulatorPath =
            eaasClientPath.substring(0, eaasClientPath.indexOf(searchingAim)) +
            "webemulator/";
        var iframe = document.createElement("iframe");
        iframe.setAttribute("style", "width: 100%; height: 600px;");
        iframe.src = webemulatorPath + "#controlurls=" + url;
        this.container.appendChild(iframe);
    }

    // WebRTC based sound
    async _initWebRtcAudio(url) {
        //const audioStreamElement = document.createElement('audio');
        //audioStreamElement.controls = true;
        //document.documentElement.appendChild(audioStreamElement);

        await fetch(url + "?connect", {
            method: "POST",
        });

        let _url = new URL(url);
        console.log("using host: " + _url.hostname + " for audio connection");
        const AudioContext =
            globalThis.AudioContext || globalThis.webkitAudioContext;
        const audioctx = new AudioContext();

        let configuredIceServers = [
            {
                urls: "stun:stun.l.google.com:19302",
            },
        ];

        if (_url.hostname !== "localhost") {
            configuredIceServers.push({
                urls: "turn:" + _url.hostname,
                username: "eaas",
                credential: "eaas",
            });
        }

        const rtcConfig = {
            iceServers: configuredIceServers,
        };
        console.log("Creating RTC peer connection...");
        this.rtcPeerConnection = new RTCPeerConnection(rtcConfig);

        this.rtcPeerConnection.onicecandidate = async (event) => {
            if (!event.candidate) {
                console.log("ICE candidate exchange finished!");
                return;
            }

            // console.log("Sending ICE candidate to server...", event.candidate);

            const body = {
                type: "ice",
                data: event.candidate,
            };

            const request = {
                method: "POST",
                body: JSON.stringify(body),
            };

            await fetch(url, request);
        };

        /*
        client.rtcPeerConnection.ontrack = async (event) => {
            console.log("XXXXXXXXXXXXXXXX ONTRACK: ", event);
            console.log("Remote track received");
            audioStreamElement.srcObject = event.streams[0];
            //audioctx.createMediaStreamSource(event.streams[0])
            //    .connect(audioctx.destination);
        };
        */

        this.rtcPeerConnection.onaddstream = async (event) => {
            console.log("Remote stream received");
            this._audioStream = event.stream;
            // HACK: Work around https://bugs.chromium.org/p/chromium/issues/detail?id=933677
            new Audio().srcObject = event.stream;
            audioctx
                .createMediaStreamSource(event.stream)
                .connect(audioctx.destination);
        };

        const onServerError = (reason) => {
            console.log("Stop polling control-messages! Reason:", reason);
        };

        const onServerMessage = async (response) => {
            if (!response.ok) {
                // console.log("Stop polling control-messages, server returned:", response.status);
                return;
            }

            try {
                const message = await response.json();
                if (message) {
                    switch (message.type) {
                        case "ice": {
                            //        console.log("Remote ICE candidate received");
                            //        console.log(message.data.candidate);
                            const candidate = new RTCIceCandidate(message.data);

                            await this.rtcPeerConnection.addIceCandidate(
                                candidate,
                            );
                            break;
                        }

                        case "sdp": {
                            //   console.log("Remote SDP offer received");
                            //  console.log(message.data.sdp);
                            const offer = new RTCSessionDescription(
                                message.data,
                            );

                            await this.rtcPeerConnection.setRemoteDescription(
                                offer,
                            );
                            const answer =
                                await this.rtcPeerConnection.createAnswer();
                            await this.rtcPeerConnection.setLocalDescription(
                                answer,
                            );
                            // console.log("SDP-Answer: ", answer.sdp);

                            const body = {
                                type: "sdp",
                                data: answer,
                            };

                            const request = {
                                method: "POST",
                                body: JSON.stringify(body),
                            };

                            // console.log("Sending SDP answer...");
                            await fetch(url, request);

                            break;
                        }

                        case "eos":
                            //  console.log("Stop polling control-messages");
                            return;

                        default:
                            console.error(
                                "Unsupported message type: " + message.type,
                            );
                    }
                }
            } catch (error) {
                console.log(error);
            }

            // start next long-polling request
            fetch(url).then(onServerMessage, onServerError);
        };
        fetch(url).then(onServerMessage);
    }

    _onResize(width, height) {
        if (!this.container) {
            console.log("container null: ");
            console.log(this);
            return;
        }

        this.container.style.width = width;
        this.container.style.height = height;

        if (this.onResize) {
            this.onResize(width, height);
        }
    }
}

export class SnapshotRequestBuilder {
    constructor(type) {
        this.type = type;
        this.message = undefined;
        this.title = undefined;
        this.isRelativeMouse = undefined;
        this.cleanRemovableDrives = undefined;
    }

    setMessage(m) {
        this.message = m;
    }

    setTitle(t) {
        this.title = t;
    }

    enableRelativeMouse(b = true) {
        this.isRelativeMouse = b;
    }

    removeVolatileDrives(b = true) {
        this.cleanRemovableDrives = b;
    }
}

/** Custom mouse-event handlers for use with the Guacamole.Mouse */
var BwflaMouse = function (client) {
    var events = [];
    var handler = null;
    var waiting = false;

    /** Adds a state's copy to the current event-list. */
    function addEventCopy(state) {
        var copy = new Guacamole.Mouse.State(
            state.x,
            state.y,
            state.left,
            state.middle,
            state.right,
            state.up,
            state.down,
        );

        events.push(copy);
    }

    /** Sets a new timeout-callback, replacing the old one. */
    function setNewTimeout(callback, timeout) {
        if (handler != null) window.clearTimeout(handler);

        handler = window.setTimeout(callback, timeout);
    }

    /** Handler, called on timeout. */
    function onTimeout() {
        while (events.length > 0) client.sendMouseState(events.shift());

        handler = null;
        waiting = false;
    }

    /** Handler for mouse-down events. */
    this.onmousedown = function (state) {
        setNewTimeout(onTimeout, 100);
        addEventCopy(state);
        waiting = true;
    };

    /** Handler for mouse-up events. */
    this.onmouseup = function (state) {
        setNewTimeout(onTimeout, 150);
        addEventCopy(state);
        waiting = true;
    };

    /** Handler for mouse-move events. */
    this.onmousemove = function (state) {
        if (waiting == true) addEventCopy(state);
        else client.sendMouseState(state);
    };
};

/** Hides the layer containing client-side mouse-cursor. */
export function hideClientCursor(guac) {
    var display = guac.getDisplay();
    display.showCursor(false);
}

/** Shows the layer containing client-side mouse-cursor. */
export function showClientCursor(guac) {
    var display = guac.getDisplay();
    display.showCursor(true);
}

export class SaveRevisionRequest extends SnapshotRequestBuilder {
    constructor(message) {
        super("saveRevision");
        this.message = message;
    }
}

export class SaveObjectEnvironmentRequest extends SnapshotRequestBuilder {
    constructor(title, message) {
        super("objectEnvironment");
        this.title = title;
        this.message = message;
    }
}

export class SaveNewEnvironmentRequest extends SnapshotRequestBuilder {
    constructor(title, message) {
        super("newEnvironment");
        this.title = title;
        this.message = message;
    }
}

export class SaveImportRequest extends SnapshotRequestBuilder {
    constructor(title) {
        super("saveImport");
        this.title = title;
    }
}

export class SaveUserSessionRequest extends SnapshotRequestBuilder {
    constructor() {
        super("saveUserSession");
    }
}

/*
 *  Example usage:
 *
 *      var centerOnScreen = function(width, height) {
 *          ...
 *      }
 *
 *      var resizeIFrame = function(width, height) {
 *          ...
 *      }
 *
 *      BWFLA.registerEventCallback(<target-1>, 'resize', centerOnScreen);
 *      BWFLA.registerEventCallback(<target-2>, 'resize', centerOnScreen);
 *      BWFLA.registerEventCallback(<target-2>, 'resize', resizeIFrame);
 */

var BWFLA = BWFLA || {};

// Method to attach a callback to an event
BWFLA.registerEventCallback = function (target, eventName, callback) {
    var event = "on" + eventName;

    if (!(event in target)) {
        console.error("Event " + eventName + " not supported!");
        return;
    }

    // Add placeholder for event-handlers to target's prototype
    if (!("__bwFlaEventHandlers__" in target)) {
        target.constructor.prototype.__bwFlaEventHandlers__ = {};
    }

    // Initialize the list for event's callbacks
    if (!(event in target.__bwFlaEventHandlers__)) {
        target.__bwFlaEventHandlers__[event] = [];
    }

    // Add the new callback to event's callback-list
    var callbacks = target.__bwFlaEventHandlers__[event];
    callbacks.push(callback);

    // If required, initialize handler management function
    if (target[event] == null) {
        target[event] = function () {
            var params = arguments; // Parameters to the original callback

            // Call all registered callbacks one by one
            callbacks.forEach(function (func) {
                func.apply(target, params);
            });
        };
    }
};

// Method to unregister a callback for an event
BWFLA.unregisterEventCallback = function (target, eventName, callback) {
    // Look in the specified target for the callback and
    // remove it from the execution chain for this event

    if (!("__bwFlaEventHandlers__" in target)) return;

    var callbacks = target.__bwFlaEventHandlers__["on" + eventName];
    if (callbacks == null) return;

    var index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
};
