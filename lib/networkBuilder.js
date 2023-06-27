import { _fetch, assignRandomMac } from "./util.js";
import { ClientOptions, NetworkComponentConfig } from "./clientOptions.js";
import {
    MachineComponentBuilder,
    InputContentBuilder,
    ContainerRuntimeBuilder,
    InputBuilder,
} from "./componentBuilder.js";

export class NetworkBuilder {
    constructor(api, idToken = null) {
        this.API_URL = api;
        this.idToken = idToken;

        console.log(this.idToken);

        this.clientOptions = null;
        this.components = [];

        this.networkConfig = {
            network: "10.0.0.0/24",
            gateway: "10.0.0.1",
            upstream_dns: "8.8.8.8",
            dhcp: {
                ip: "10.0.0.2",
            },
            environments: [],
        };
    }

    addComponent(c) {
        let label = "machine " + this.components.length;
        let networkComponentConfig = new NetworkComponentConfig(label);
        c.setNetworkConfig(networkComponentConfig);
        this.components.push(c);
    }

    getComponents() {
        return this.components;
    }

    getClientOptions() {
        return this.clientOptions;
    }

    getDefaultClientOptions() {
        return ClientOptions.getDefaultOptions();
    }

    async getSessions() {
        return _fetch(`${this.API_URL}/sessions`, "GET", null, this.idToken);
    }

    getNetworkConfig() {
        return this.networkConfig;
    }

    async getSession(sessionKey) {
        let sessions = await this.getSessions();
        if (!sessions) throw new Error("no sessions found");

        const session = sessions.find((s) => s.name === sessionKey);
        if (session) return session;
        else
            throw new Error(
                "session not found " + sessions + " key " + sessionKey,
            );
    }

    async getNetworkEnvironmentById(id) {
        return await _fetch(
            `${this.API_URL}/network-environments/${id}`,
            "GET",
            null,
            this.idToken,
        );
    }

    async getEnvironmentById(envId) {
        return await _fetch(
            `${this.API_URL}environment-repository/environments/${envId}`,
            "GET",
            null,
            this.idToken,
        );
    }

    async loadNetworkEnvironment(networkEnvironment) {
        this.clientOptions = new ClientOptions(networkEnvironment);
        for (const networkElement of networkEnvironment.emilEnvironments) {
            let env = await this.getEnvironmentById(networkElement.envId);

            let component;
            if (env.runtimeId) {
                // TODO: How do snapshot the network environment in this case?
                component = new MachineComponentBuilder(
                    env.runtimeId,
                    "public",
                );
                component.setLinuxRuntime({
                    userContainerEnvironment: env.envId,
                    userContainerArchive: env.archive,
                    networking: env.networking,
                });
                // TODO: Possibly allow input media for network environments?
                // machine.addInputMedia(input);
                // TODO: Set client options from runtime?
                // let clientOptions = await EaasClientHelper.clientOptions(vm.env.runtimeId);
            } else {
                component = new MachineComponentBuilder(env.envId, env.archive);
            }
            component.setEthernetAddress(networkElement.macAddress);
            component.setObject(env.objectId, env.objectArchive);

            if (networkElement.toVisualize) {
                component.setInteractive();
            }

            let networkComponentConfig = new NetworkComponentConfig(
                networkElement.label,
                networkElement.macAddress,
            );
            networkComponentConfig.setServerConfiguration(
                networkElement.serverIp,
                networkElement.serverPorts,
            );
            networkComponentConfig.setFqdn(networkElement.fqdn);
            component.setNetworkConfig(networkComponentConfig);

            // this needs to be done elsewhere
            component.setEthernetAddress(networkElement.macAddress);

            this.components.push(component);
        }

        if (networkEnvironment.smbServiceId) {
            let smbEnvironment = await this.getEnvironmentById(
                networkEnvironment.smbServiceId,
            );
            if (!smbEnvironment)
                throw new Error(
                    "smb environment " +
                        networkEnvironment.smbServiceId +
                        " not available.",
                );
            this.components.push(await this.buildSmbService(smbEnvironment));
        }

        if (networkEnvironment.linuxArchiveProxyEnvId) {
            let linuxArchiveProxyEnvironment = await this.getEnvironmentById(
                networkEnvironment.linuxArchiveProxyEnvId,
            );
            if (!linuxArchiveProxyEnvironment)
                throw new Error(
                    "linux archive proxy environment " +
                        linuxArchiveProxyEnvId +
                        " not available",
                );
            this.components.push(
                await this.buildLinuxArchiveService(
                    linuxArchiveProxyEnvironment,
                ),
            );
        }

        if (networkEnvironment.dnsServiceEnvId) {
            let dnsEnvironment = await this.getEnvironmentById(
                networkEnvironment.dnsServiceEnvId,
            );
            if (!dnsEnvironment)
                throw new Error(
                    "dnsEnvironment " +
                        networkEnvironment.dnsServiceEnvId +
                        " not available.",
                );
            this.components.push(
                await this.buildDnsService(
                    dnsEnvironment,
                    networkEnvironment.envId,
                ),
            );
        }

        console.log(this.components);
    }

    async buildSmbService(smbEnvironment) {
        const component = new MachineComponentBuilder(
            smbEnvironment.runtimeId,
            "public",
        );
        const sts = await _fetch(`${this.API_URL}/user-data-storage/sts`);

        let runtimeBuilder = new ContainerRuntimeBuilder(
            smbEnvironment.envId,
            smbEnvironment.archive,
        );
        runtimeBuilder.enableDhcp(true);
        runtimeBuilder.addUserEnvironment(
            "EAAS_STORAGE_CONFIG=" + JSON.stringify(sts.data),
        );
        component.setRuntime(runtimeBuilder);

        let networkComponentConfig = new NetworkComponentConfig(
            "Windows Network Storage Service",
        );
        networkComponentConfig.setFqdn("storage");
        component.setNetworkConfig(networkComponentConfig);

        return component;
    }

    async enableDhcpService(config) {
        let dnsEnvironment = await this.getEnvironmentById("service-dns");
        this.components.push(
            await this.buildDnsService(dnsEnvironment, null, config),
        );
    }

    async buildDnsService(dnsEnvironment, networkId, config = null) {
        let runtimeBuilder = new ContainerRuntimeBuilder(
            dnsEnvironment.envId,
            "public",
        );
        if (dnsEnvironment.networking) {
            runtimeBuilder.enableDhcp(dnsEnvironment.networking.isDHCPenabled);
            runtimeBuilder.enableTelnet(
                dnsEnvironment.networking.isTelnetEnabled,
            );
        }

        if (!config) {
            if (!networkId)
                throw new Error(
                    "Either config or network ID is required to configure DHCP",
                );
            config = await _fetch(
                `${this.API_URL}/network-environments/${networkId}?json=true`,
            );
            console.log("config :>> ", config);
            console.log("adding locally configured components");
            config.environments.push(...this.networkConfig.environments);
            console.log("config :>> ", config);
        }
        runtimeBuilder.addUserEnvironment(
            `EAAS_NETWORK_CONFIG=${JSON.stringify(config)}`,
        );

        const component = new MachineComponentBuilder(
            dnsEnvironment.runtimeId,
            "public",
        );
        component.setRuntime(runtimeBuilder);

        let networkComponentConfig = new NetworkComponentConfig(
            "DNS/DHCP Service",
        );
        component.setNetworkConfig(networkComponentConfig);

        return component;
    }

    async enableLinuxArchiveService() {
        let linuxArchiveProxyEnvironment = await this.getEnvironmentById(
            "service-archive-proxy",
        );
        this.components.push(
            await this.buildLinuxArchiveService(linuxArchiveProxyEnvironment),
        );
    }

    async buildLinuxArchiveService(archiveEnvironment) {
        let runtimeBuilder = new ContainerRuntimeBuilder(
            archiveEnvironment.envId,
            archiveEnvironment.archive,
        );
        runtimeBuilder.enableDhcp(true);
        if (archiveEnvironment.networking)
            runtimeBuilder.enableTelnet(
                archiveEnvironment.networking.isTelnetEnabled,
            );

        const component = new MachineComponentBuilder(
            archiveEnvironment.runtimeId,
            "public",
        );
        component.setRuntime(runtimeBuilder);

        let networkComponentConfig = new NetworkComponentConfig(
            "Linux Archive Proxy Service",
            assignRandomMac(),
        );
        networkComponentConfig.setFqdn("ftp.debian.org");
        component.setNetworkConfig(networkComponentConfig);

        this.networkConfig.environments.push({
            mac: networkComponentConfig.hwAddress,
            hostnames: [networkComponentConfig.fqdn],
        });

        return component;
    }

    async init(client, sessionKey, lifeTime) {
        await client.start(this.components, this.clientOptions);
        await client.detach(sessionKey, lifeTime);
    }

    async connectNetworkSession(client, networkId, sessionKey) {
        let session = null;
        try {
            session = await this.getSession(sessionKey);
            console.log(session);
        } catch (e) {
            console.log(e);
        }

        if (!session) {
            await this.init(client, networkId, sessionKey);
            session = await this.getSession(sessionKey);
            console.log(session);
        }
        return session;
    }
}
