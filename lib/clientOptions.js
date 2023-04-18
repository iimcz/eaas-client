/**
 * EaaS client options to start a session
 */
export class ClientOptions {
    constructor(networkEnvironment = null) {
        this.networkEnabled = (networkEnvironment) ? true : false;
        this.networkConfig = new NetworkConfig(networkEnvironment);
        this.xpraEncoding = null;
        /** @type { undefined | "auto" | "none" } */
        this.ghostCursor = undefined;
    }

    setXpraEncoding(val) {
        this.xpraEncoding = val;
    }

    getXpraEncoding() {
        return this.xpraEncoding;
    }

    getNetworkConfig() {
        return this.networkConfig;
    }

    enableNetworking(val = true) {
        this.networkEnabled = val;
    }

    isNetworkEnabled() {
        return this.networkEnabled;
    }

    static getDefaultOptions() {
        let clientOptions = new ClientOptions();
        clientOptions.enableNetworking(true);
        clientOptions.getNetworkConfig().setNetworkDefaults();

        return clientOptions;
    }
}
/**
 * Network Configuration options
 */
export class NetworkConfig {
    constructor(networkEnvironment = null) {
        this.components = [];

        if (!networkEnvironment) {
            this._enableInternet = false;
            this.dhcpEnabled = false;
            this.gateway = null;
            this.network = null;
            this.tcpGatewayConfig = null;
        } else {
            this.setNetwork(networkEnvironment.network);
            this.setGateway(networkEnvironment.gateway);
            this.enableInternet(networkEnvironment.enableInternet);
            if (!networkEnvironment.dnsServiceEnvId)
                this.enableSlirpDhcp(networkEnvironment.isDHCPenabled);

            try {
                let tcpGatewayConfig = new TcpGatewayConfig(networkEnvironment.networking.serverIp, networkEnvironment.networking.serverPort);
                tcpGatewayConfig.enableSocks(networkEnvironment.networking.enableSocks);
                tcpGatewayConfig.enableLocalMode(networkEnvironment.networking.localServerMode);
                this.setTcpGatewayConfig(tcpGatewayConfig);
            } catch (e) {
                // console.log(e);
            }
        }
    }

    setNetworkDefaults() {
        this.setNetwork("10.0.0.0/24");
        this.setGateway("10.0.0.1");
    }

    setTcpGatewayConfig(conf) {
        this.tcpGatewayConfig = conf;
    }

    getTcpGatewayConfig() {
        return this.tcpGatewayConfig;
    }

    enableInternet(val = true) {
        this._enableInternet = val;
    }

    enableSlirpDhcp(val = true) {
        this.dhcpEnabled = val;
    }

    setGateway(val) {
        this.gateway = val;
    }

    setNetwork(val) {
        this.network = val;
    }

    addNetworkComponent(component) {
        if (!this.components.includes(component)) this.components.push(component);
    }

    build() {
        const hasTcpGateway = (this.tcpGatewayConfig && !this.tcpGatewayConfig.isLocalModeEnabled()) ? true : false;

        let networkRequest = {
            hasInternet: this._enableInternet,
            enableDhcp: this.dhcpEnabled,
            gateway: this.gateway,
            network: this.network,
            hasTcpGateway: hasTcpGateway,
            tcpGatewayConfig: this.tcpGatewayConfig ? this.tcpGatewayConfig.build() : {}
        };

        networkRequest.components = [];
        this.components.forEach(element => {
            networkRequest.components.push(element.build());
        });
        return networkRequest;
    }
}

export class NetworkComponentConfig {
    constructor(networkLabel, hwAddress) {
        this.componentId = undefined; // unused?
        this.networkLabel = networkLabel;
        this.hwAddress = "auto";
        this.fqdn = null;

        this.serverIp = null;
        this.serverPorts = null;

        if (hwAddress)
            this.hwAddress = hwAddress;
    }

    setFqdn(val) {
        this.fqdn = val;
    }

    getFqdn() {
        return this.fqdn;
    }

    setComponentId(componentId) {
        this.componentId = componentId;
    }

    setServerConfiguration(serverIp, serverPorts) {
        this.serverIp = serverIp;
        this.serverPorts = serverPorts;
    }

    build() {
        return {
            componentId: this.componentId,
            networkLabel: this.networkLabel,
            fqdn: this.fqdn,
            hwAddress: this.hwAddress,
            serverIp: this.serverIp,
            serverPorts: this.serverPorts
        };
    }
}

export class TcpGatewayConfig {
    constructor(ip, port) {
        this.socks = null;

        if (!ip || !port)
            throw new Error("ip and portnumber are required");

        this.serverPort = port;
        this.serverIp = ip;
        this.localMode = false; // if true -> tcpGateway is false, but config is set
    }

    enableSocks(val = true) {
        this.socks = val;
    }

    enableLocalMode(val = true) {
        this.localMode = val;
    }

    getServerIp() {
        return this.serverIp;
    }

    getServerPort() {
        return this.serverPort;
    }

    isLocalModeEnabled() {
        return this.localMode;
    }

    build() {
        return {
            socks: this.socks,
            serverIp: this.serverIp,
            serverPort: this.serverPort
        };
    }
}