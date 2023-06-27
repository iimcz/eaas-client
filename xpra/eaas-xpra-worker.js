const xpraJsPath = "./xpra-html5/html5/js/";

importScripts = new Proxy(importScripts, {
    apply(target, thisArgument, argumentsList) {
        Reflect.apply(
            target,
            thisArgument,
            argumentsList.map((v) => `${xpraJsPath}${v}`),
        );
    },
});

if (!globalThis.setImmediate) {
    const handlers = [];
    const { port1, port2 } = new MessageChannel();
    port2.onmessage = () => handlers.shift()();

    globalThis.setImmediate = (handler, ...args) => {
        handlers.push(() => handler(...args));
        port1.postMessage(undefined);
    };
}

importScripts("Protocol.js");

XpraProtocol.prototype.process_receive_queue = new Proxy(
    XpraProtocol.prototype.process_receive_queue,
    {
        apply(target, thisArgument, argumentsList) {
            do {
                Reflect.apply(target, thisArgument, argumentsList);
            } while (
                thisArgument.rQ.length > 0 &&
                thisArgument.header.length === 0
            );
        },
    },
);
