import { Client } from "./eaas-client/eaas-client.js";
import { getTokenUsingResourceOwnerPassword } from "./eaas-client/lib/oauth-client.js";
import { _fetch, Task } from "./eaas-client/lib/util.js";

export const clientFromUrl = async (instanceUrl) => {
    const url = new URL(instanceUrl);
    let { username, password } = url;
    const api = String(
        Object.assign(new URL("/emil", url), { username: "", password: "" }),
    );
    const { id_token } = password
        ? await getTokenUsingResourceOwnerPassword({
              issuer: String(new URL("/auth/realms/master", api)),
              username,
              password,
              client_id: "eaas",
          })
        : {};

    const client = new EaasClient(api, id_token, { emulatorContainer: {} });
    return client;
};

class EaasClient extends Client {
    async apiFetch(path, data, method = "POST") {
        return await _fetch(
            `${this.API_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
            method,
            data,
            this.idToken,
        );
    }

    async createTask(path, data) {
        const { taskId } = await this.apiFetch(path, data);
        const task = new Task(taskId, this.API_URL, this.idToken);
        const result = await task.done;
        if (result.object) {
            const object = JSON.parse(result.object);
            return object;
        }
        if (result.userData) return result.userData;
    }

    testUrl({ envId }) {
        const url = new URL(
            "http://localhost:8080/contrib/test-webcomponent/test.html",
        );
        url.hash = String(
            new URLSearchParams({
                eaasService: this.API_URL,
                envId,
            }),
        );
        return String(url);
    }
}
