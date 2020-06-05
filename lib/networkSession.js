import {_fetch} from './util.js'
import { NetworkComponentConfig } from './clientOptions.js';

export class NetworkSession extends EventTarget {
    constructor(api, idToken = null) {
        super();
        this.sessionId = undefined;
        this.API_URL = api;
        this.idToken = idToken;
        this.sessionComponents = [];
        this.isDetached = false;
        this.networkConfig = null;
    }

    async keepalive() {
        if (!this.sessionId || this.isDetached)
            return;
        _fetch(`${this.API_URL}/sessions/${this.sessionId}/keepalive`, "POST", null, this.idToken);
    }

    async relase() {
        if (!this.sessionId || this.isDetached)
            return;

        _fetch(`${this.API_URL}/sessions/${this.sessionId}`, "DELETE", null, this.idToken);
        this.sessionId = undefined;
    }

    async wsConnection() {

        if (this.sessionId == null) {
            return null;
        }
        const url = `${this.API_URL}/networks/${this.sessionId}/wsConnection`;
        const res = await _fetch(url, "GET", null, this.idToken);

        if (!res.ok)
            throw new Error(await res.text());

        const url2 = new URL(res.wsConnection, this.API_URL);
        if (url2.port === "443")
            url2.protocol = "wss";
        return String(url2);
    }

    load(sessionId, sessions, options)
    {
        this.isDetached = true;
        this.sessionId = sessionId;
        for (const session of sessions) {
            this.sessionComponents.push(session);
            session.setNetwork(this);
        }
        this.networkConfig = options;
    }

    getNetworkConfig(componentId)
    {
        for(let compConfig of this.networkConfig.components)
        {
            console.log(compConfig);
            if(compConfig.componentId === componentId)
                return compConfig;
        }
        return null;
    }

    async startNetwork(sessions, options) {
        for (const session of sessions) {
            let netComponent = session.request.getNetworkConfig();
            if(!netComponent) {
                console.log("network session component not configured");
                continue;
            }        
            netComponent.setComponentId(session.componentId);
            options.getNetworkConfig().addNetworkComponent(netComponent);
            this.sessionComponents.push(session);
        }

        let result = await _fetch(`${this.API_URL}/networks`, "POST", options.getNetworkConfig().build(), this.idToken);
        this.sessionId = result.id;
        console.log(options.getNetworkConfig().build());
        console.log(result);
        this.networkConfig = options.getNetworkConfig().build();
        this.networkTcpInfo = result.networkUrls != null ? result.networkUrls.tcp : null;
        for (const session of this.sessionComponents) {
            session.setNetwork(this);
        }
    }

    getId()
    {
        return this.sessionId;
    }


    async remove(compid) {
        console.log("Removing component " + compid + " from network " + this.sessionId);
        await _fetch(`${this.API_URL}/networks/${this.sessionId}/components/${compid}`, "DELETE", null, this.idToken);
    }

    getSession(id)
    {
        for(let session of this.sessionComponents)
        {
            if(session.componentId === id)
                return session;
        }
        throw new Error("session not found");
    }

    getSessions() {
        return this.sessionComponents;
    }

    async detach(name, detachTime_minutes) {
        if (this.isDetached)
            return;
        console.log("detaching session " + this.sessionId);
        let res = await _fetch(`${this.API_URL}/sessions/${this.sessionId}/detach`, "POST", {
            lifetime: detachTime_minutes,
            lifetime_unit: "minutes",
            sessionName: name,
        }, this.idToken);
        this.isDetached = true;
        console.log("detach result: " + res);
    }
}