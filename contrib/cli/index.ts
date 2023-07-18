#!/bin/sh
true /*; exec node -r ts-node/register/transpile-only "$0" "$@";*/;

/*const promisifyObject = (object: object) => new Proxy(object, {
    get(...a) {
        return promisify(Reflect.get(...a));
    }
});*/

import * as process from "process";
import puppeteer from "puppeteer";
import { promisify } from "util";
import * as child_process from "child_process";
const execFile = promisify(child_process.execFile);
import { promises as fs } from "fs";
import { type } from "os";
const { stat } = fs;

const EAAS_PROXY_PATH = "./eaas-proxy";
const EAAS_PROXY_URL =
    "https://gitlab.com/emulation-as-a-service/eaas-proxy/-/jobs/artifacts/master/raw/eaas-proxy/eaas-proxy?job=build";

const [_url, command] = process.argv.slice(2);
const url = new URL(_url);
const { username, password } = url;

const xpathString = (string: string) =>
    `concat("","${string.replace(/"/g, '",\'"\',"')}")`;

const startsWithI = (expr: string, string: string) =>
    `starts-with(translate(normalize-space(${expr}),
    ${xpathString(string.toUpperCase())},
    ${xpathString(string.toLowerCase())}),
    ${xpathString(string.toLowerCase())})`;

const xpathStartsWithI = (string: string | { localName: string }) =>
    typeof string === "string"
        ? `//node()[self::text() and ${startsWithI(
              ".",
              string,
          )} or ${startsWithI(
              "@placeholder",
              string,
          )}]/parent::*[name(.)!="script" and name(.)!="style"]`
        : `//descendant-or-self::*[name(.)=${xpathString(string.localName)}]`;

const xpathStartsWithIAfter = (
    string: string | { localName: string },
    before: string,
) => `${xpathStartsWithI(before)}/following::*${xpathStartsWithI(string)}`;

const xpathStartsWithIBefore = (string: string, after: string) =>
    `(${xpathStartsWithI(after)}/preceding::*${xpathStartsWithI(string)})
      [position()=last()]`;

const evaluate = function*(expr: string) {
    const it = document.evaluate(expr, document);
    for (let val; (val = it.iterateNext()); yield val);
};

const timeout = (time_ms: number) => new Promise(r => setTimeout(r, time_ms));

// [...document.querySelectorAll("a, button")].filter(v => v.innerText.trim().toLowerCase().startsWith(string.toLowerCase()) && v.getBoundingClientRect().width !== 0)

class Page2 {
    constructor(public page: puppeteer.Page) {}
    async waitForString(string: string) {
        return this.page.waitForXPath(xpathStartsWithI(string));
    }
    async waitForStringAfter(string: string, before: string) {
        return this.page.waitForXPath(xpathStartsWithIAfter(string, before));
    }
    async waitForStringBefore(string: string, after: string) {
        return this.page.waitForXPath(xpathStartsWithIBefore(string, after));
    }
    async click(
        string: string | { localName: string },
        {
            before,
            after,
        }: { before?: string; after?: string; localName?: string } = {},
    ) {
        const obj = await (after
            ? this.waitForStringAfter(string, after)
            : before
            ? this.waitForStringBefore(string, before)
            : this.waitForString(string));
        console.log(await obj.evaluate(v => v.outerHTML));
        obj.evaluate(v => (v.style.outline = "5px red solid"));
        await timeout(1000);
        obj.evaluate(v => ((v as HTMLElement).style.outline = "unset"));
        await obj.click();
    }
    async type(string: string) {
        await this.page.keyboard.type(string);
    }
    async clickUntilGone(string: string) {
        try {
            for (;;) await this.click(string);
        } catch {}
    }
}

const run = (command: string, args: string[] = []) => {
    const process = child_process.spawn(command, args, {
        stdio: "inherit",
    });
    return new Promise((resolve, reject) => {
        process.on("error", reject);
        process.on("exit", resolve);
    });
};

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = new Page2(await browser.newPage());
    globalThis.page = page;

    await page.page.authenticate({ username, password });
    await page.page.goto(String(url), { waitUntil: "networkidle2" });

    if (command === "import") {
        await page.click("import container");
        await page.click("choose a runtime");
        await page.click("docker");
        await page.click("name:");
        await page.type(
            "registry.gitlab.com/emulation-as-a-service/experiments/fake-dns",
        );
        await page.click("image tag");
        await page.type("debug-proxy-ia");
        await page.click("start");
        await page.clickUntilGone("importing image");
        await page.click({ localName: "input" }, { after: "title" });
        await page.type(`pywb ${new Date().toISOString()}`);
        await page.click({ localName: "p" }, { after: "description" });
        await page.type(".");
        await page.click("ok");
        return;
    }
    // await page.click("machines");
    // await page.click("virtual machines");
    await page.click("environments");
    await page.click("networks");
    await page.click("search");
    const envName = "tracenoizer";
    await page.type(envName);
    await page.click("choose action");
    await page.click("run");
    await timeout(1000);
    const eaasClient = await page.page.evaluateHandle(
        () =>
            angular.element(document.querySelector("[ui-view=wizard]")).scope()
                .startEmuCtrl.eaasClient,
    );

    console.log(eaasClient);
    await page.click("Network Environment Overview");
    console.log("RUNNING");
    const proxyURLTelnet = await page.page.evaluate(eaasClient => {
        return eaasClient.getProxyURL({
            serverIP: "10.0.0.1",
            serverPort: "23",
            localPort: "8099",
        });
    }, eaasClient);
    console.log("telnet is available at:\n", proxyURLTelnet);
    const proxyURL = await page.page.evaluate(eaasClient => {
        return eaasClient.getProxyURL({
            serverIP: "socks5",
            serverPort: "",
            localPort: "8090",
        });
    }, eaasClient);
    console.log(proxyURL);
    if (!(await stat(EAAS_PROXY_PATH).catch(() => {}))) {
        await run("curl", ["-L", "-o", EAAS_PROXY_PATH, EAAS_PROXY_URL]);
        await run("chmod", ["+x", EAAS_PROXY_PATH]);
    }
    await run(EAAS_PROXY_PATH, [proxyURL]);
    console.log("DONE");
})()
    .catch(e => {
        console.log(e);
        throw e;
    })
    .catch(() => {
        require("repl").start();
    });
