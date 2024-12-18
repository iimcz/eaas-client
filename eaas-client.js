import { NetworkSession } from "./lib/networkSession.js";
import {
    ComponentSession,
    SnapshotRequestBuilder,
} from "./lib/componentSession.js";
import {
    _fetch,
    ClientError,
    sendAltTab,
    sendCtrlAltDel,
    sendEsc,
} from "./lib/util.js";

import { ClientOptions } from "./lib/clientOptions.js";

export { sendAltTab, sendCtrlAltDel, sendEsc };
export { ClientError, SnapshotRequestBuilder };

const STATE_POLLING_DELAY = 5000;
const KEEPALIVE_DELAY = 14000;

/**
 * Main EaaS Client class
 *
 * @export
 * @class Client
 * @extends {EventTarget}
 * @param {URL} api_entrypoint
 * @param {Object} idToken
 * @param {Object} kbLayoutPrefs
 */
export class Client extends EventTarget {
    constructor(
        api_entrypoint,
        idToken = null,
        {
            kbLayoutPrefs,
            emulatorContainer = document.getElementById("emulator-container"),
        } = {},
    ) {
        super();
        this.API_URL = api_entrypoint
            .replace(/([^:])(\/\/+)/g, "$1/")
            .replace(/\/+$/, "");
        this.container = undefined;
        this.kbLayoutPrefs = kbLayoutPrefs
            ? kbLayoutPrefs
            : {
                  language: {
                      name: "us",
                  },
                  layout: {
                      name: "pc105",
                  },
              };
        this.idToken = idToken;

        this.deleteOnUnload = true;

        this.options = null;

        this.sessions = [];

        /**
         * component session attached to browser canvas
         */
        this.activeView = null;
        this.defaultView = null;

        this.envsComponentsData = [];

        this.isConnected = false;
        this.isReleased = false;

        this.xpraConf = {
            xpraWidth: 640,
            xpraHeight: 480,
            xpraDPI: 96,
            xpraEncoding: "jpeg",
            ghostCursor: undefined,
        };
        this.emulatorContainer = emulatorContainer;

        // ID for registered this.pollState() with setInterval()
        this.pollStateIntervalId = null;
        this.nextKeepaliveTimestamp = 0;

        // Clean up on window close
        window.addEventListener("beforeunload", () => {
            if (this.deleteOnUnload) this.release();
        });
    }

    setXpraConf(width, height, dpi, xpraEncoding) {
        this.xpraConf = {
            xpraWidth: width,
            xpraHeight: height,
            xpraDPI: dpi,
            xpraEncoding: xpraEncoding,
            ghostCursor: undefined,
        };
    }

    // ... token &&  { authorization : `Bearer ${token}`},
    // ... obj && {"content-type" : "application/json" }
    // ...obj && {body: JSON.stringify(obj) },

    async _pollState() {
        const curtime = performance.now();
        const triggerKeepalive = curtime > this.nextKeepaliveTimestamp;
        if (triggerKeepalive) {
            this.nextKeepaliveTimestamp = curtime + KEEPALIVE_DELAY;
        }

        if (triggerKeepalive && this.network) {
            this.network.keepalive();
        }

        // NOTE: ephemeral sessions should be handled explicitly here,
        //       all background (== non-ephemeral) ones will be handled
        //       by the backend as part of the network-session lifecycle!

        for (const session of this.sessions) {
            if (!session.isEphemeral) {
                continue;
            }

            let result = await session.getEmulatorState();
            if (!result) continue;

            let emulatorState = result.state;

            if (
                emulatorState == "INITIALIZING" ||
                emulatorState == "RUNNING" ||
                // HACK: "OK" and "READY" are obsolete state names which might still be used by the eaas-server
                emulatorState == "OK" ||
                emulatorState == "READY"
            ) {
                if (triggerKeepalive) {
                    session.keepalive();
                }
            } else if (
                emulatorState == "STOPPED" ||
                emulatorState == "FAILED"
            ) {
                if (this.onEmulatorStopped) this.onEmulatorStopped();
                session.keepalive();
                this.dispatchEvent(
                    new CustomEvent("error", {
                        detail: `${emulatorState}`,
                    }),
                ); // .addEventListener("error", (e) => {})
            } else {
                this.dispatchEvent(
                    new CustomEvent("error", {
                        detail: session,
                    }),
                );
            }
        }
    }

    getActiveSession() {
        return this.activeView;
    }

    /*
        needs to be a global client function,
        we may checkpoint more then a single machine in the future.
     */
    async checkpoint(request) {
        let session = this.activeView;
        this.disconnect();
        return session.checkpoint(request);
    }

    disconnect() {
        if (!this.activeView) {
            return;
        }

        let myNode = this.emulatorContainer;
        // it's supposed to be faster, than / myNode.innerHTML = ''; /
        while (myNode && myNode.firstChild) {
            myNode.removeChild(myNode.firstChild);
        }
        this.activeView.disconnect();
        this.activeView = undefined;
        this.container = undefined;
        console.log("Viewer disconnected successfully.");
    }

    async attachNewEnv(sessionId, container, environmentRequest) {
        let session = await _fetch(
            `${this.API_URL}/sessions/${sessionId}`,
            "GET",
            null,
            this.idToken,
        );
        session.sessionId = sessionId;
        this.load(session);

        environmentRequest.setKeyboard(
            this.kbLayoutPrefs.language.name,
            this.kbLayoutPrefs.layout.name,
        );
        let componentSession = await ComponentSession.createComponent(
            environmentRequest,
            this.API_URL,
            this.idToken,
        );
        this.pollStateIntervalId = setInterval(() => {
            this._pollState();
        }, STATE_POLLING_DELAY);

        this._connectToNetwork(componentSession, sessionId);

        this.network.sessionComponents.push(componentSession);
        this.network.networkConfig.components.push({
            componentId: componentSession.componentId,
            networkLabel: "Temp Client",
        });
        this.sessions.push(componentSession);

        await this.connect(container, componentSession);
    }

    async attach(sessionId, container, _componentId) {
        let session = await _fetch(
            `${this.API_URL}/sessions/${sessionId}`,
            "GET",
            null,
            this.idToken,
        );
        session.sessionId = sessionId;
        this.load(session);

        let componentSession;
        if (_componentId) {
            componentSession = this.getSession(_componentId);
        }
        this.pollStateIntervalId = setInterval(() => {
            this._pollState();
        }, STATE_POLLING_DELAY);

        console.log("attching component:" + componentSession);
        await this.connect(container, componentSession);
    }

    /**
     * @param {Array<Object>} components
     * @param {ClientOptions} options
     */
    async start(components, options) {
        if (options) {
            console.log(
                "setting xpra encoding to " + options.getXpraEncoding(),
            );
            this.xpraConf.xpraEncoding = options.getXpraEncoding();
            this.xpraConf.ghostCursor = options.ghostCursor;
        }

        try {
            const promisedComponents = components.map(async (component) => {
                component.setKeyboard(
                    this.kbLayoutPrefs.language.name,
                    this.kbLayoutPrefs.layout.name,
                );
                let componentSession = await ComponentSession.createComponent(
                    component,
                    this.API_URL,
                    this.idToken,
                );
                this.sessions.push(componentSession);
                if (component.isInteractive() === true) {
                    this.defaultView = componentSession;
                }
                return componentSession;
            });

            console.log("starting client side keep alive");
            this.pollStateIntervalId = setInterval(() => {
                this._pollState();
            }, STATE_POLLING_DELAY);

            await Promise.all(promisedComponents);

            if (options && options.isNetworkEnabled()) {
                console.log("starting network...");
                this.network = new NetworkSession(this.API_URL, this.idToken);
                await this.network.startNetwork(this.sessions, options);
            }
        } catch (e) {
            this.release(true);
            console.log(e);
            throw new ClientError("Starting environment session failed!", e);
        }
    }

    load(session) {
        const sessionId = session.sessionId;
        const sessionComponents = session.components;
        const networkInfo = session.network;

        for (const sc of sessionComponents) {
            if (sc.type !== "machine") continue;

            if (
                this.sessions.filter(
                    (sessionComp) => sessionComp.componentId === sc.componentId,
                ).length > 0
            ) {
                continue;
            }

            let session = new ComponentSession(
                this.API_URL,
                sc.environmentId,
                sc.componentId,
                this.idToken,
            );
            session.isEphemeral = false;
            this.sessions.push(session);
        }

        this.network = new NetworkSession(this.API_URL, this.idToken);
        this.network.load(sessionId, this.sessions, networkInfo);
        this.network.isEphemeral = false;
    }

    async _connectToNetwork(component, networkID) {
        const result = await _fetch(
            `${this.API_URL}/networks/${networkID}/components`,
            "POST",
            {
                componentId: component.getId(),
                ephemeral: component.isEphemeral,
            },
            this.idToken,
        );
        return result;
    }

    async release(all = false) {
        // Workaround for bad consumers calling this method redundantly!
        if (this.isReleased) {
            console.log(new Error("Client already released, skip redundant call"));
            return;
        } else {
            this.isReleased = true;
        }

        this.disconnect();
        clearInterval(this.pollStateIntervalId);

        const whatmsg = all ? "all" : "ephemeral";
        console.log(`Releasing ${whatmsg} sessions...`);

        let url;
        for (const session of this.sessions) {
            // NOTE: only ephemeral sessions should be stopped here,
            //       other sessions will be handled by the backend!
            if (all || session.isEphemeral) {
                url = await session.stop();
            }

            await session.release();
        }

        this.sessions = [];

        if (this.network) {
            await this.network.release();
            this.network = undefined;
        }

        console.log(`Released ${whatmsg} sessions`);

        return url;
    }

    getSession(id) {
        if (!this.network) throw new Error("no sessions available");

        return this.network.getSession(id);
    }

    getSessions() {
        if (!this.network) {
            return [];
        }

        const sessionInfo = [];
        let networkSessions = this.network.getSessions();

        for (let session of networkSessions) {
            const conf = this.network.getNetworkConfig(session.componentId);
            let componentSession = this.getSession(conf.componentId);
            console.log(componentSession);
            sessionInfo.push({
                id: conf.componentId,
                title: conf.networkLabel,
            });
        }
        return sessionInfo;
    }

    async connect(container, view) {
        if (!view) {
            if (this.defaultView) {
                view = this.defaultView;
            } else {
                console.log("no view defined. using first session");
                view = this.sessions[0];
            }
        }

        if (this.activeView) this.disconnect();

        if (!view) throw new Error("no active view possible");

        this.activeView = view;
        console.log(`Connecting viewer... @ ${container}`);
        try {
            await this.activeView.connect(container, this.xpraConf);
            this.isConnected = true;
        } catch (e) {
            console.error("Connecting viewer failed!");
            console.log(e);
            this.activeView = undefined;
        }
    }

    async detach(name, detachTime_minutes) {
        if (!this.network) throw new Error("No network session available");

        await this.network.detach(name, detachTime_minutes);
        window.onbeforeunload = () => {};
        this.disconnect();
    }

    async stop() {
        // let activeSession = this.activeView;
        let results = [];
        this.disconnect();
        for (const session of this.sessions) {
            let result = await session.stop();
            results.push({
                id: session.getId(),
                result: result,
            });
        }
        return results;
    }
}
