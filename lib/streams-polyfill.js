import { WritableStream } from "../third_party/web-streams-polyfill/ponyfill.es6.mjs.js";
import "../third_party/text-encode-transform-polyfill/text-encode-transform.js";

const _writable = new WeakMap();
const _readable = new WeakMap();
const _writeController = new WeakMap();
const _readController = new WeakMap();

const call = (object, method, args) => {
    const fun = object[method];
    if (typeof fun === "undefined") return;
    if (typeof fun !== "function") throw new TypeError();
    return Reflect.apply(fun, object, args);
};

/**
 * A polyfill for `TransformStream` that uses the native `ReadableStream`
 * and `WritableStream` implementations.
 */
class TransformStream {
    constructor(
        transformer = {},
        writableStrategy = {},
        readableStrategy = {},
    ) {
        let resolveRead = () => {};
        const writable = new WritableStream(
            {
                start: (writeController) => {
                    _writeController.set(this, writeController);
                },
                write: async (chunk) => {
                    const readC = _readController.get(this);
                    if (readC.desiredSize <= 0) {
                        await new Promise((r) => (resolveRead = r));
                    }
                    return call(transformer, "transform", [chunk, controller]);
                },
                close: async () => {
                    await call(transformer, "flush", [controller]);
                    _readController.get(this).close();
                },
                abort: () => {
                    return _readController.get(this).error();
                },
            },
            writableStrategy,
        );
        const readable = new ReadableStream(
            {
                start: (readController) => {
                    _readController.set(this, readController);
                    if (typeof transformer.start !== "function") return;
                    return transformer.start(controller);
                },
                pull: (chunk, controller) => {
                    resolveRead();
                },
                cancel(reason) {},
            },
            readableStrategy,
        );
        const controller = makeTransformStreamDefaultController(
            _writeController.get(this),
            _readController.get(this),
        );

        _writable.set(this, writable);
        _readable.set(this, readable);
    }
    get writable() {
        return _writable.get(this);
    }
    get readable() {
        return _readable.get(this);
    }
}

export { TransformStream as default };

const _readController2 = new WeakMap();
const _writeController2 = new WeakMap();
const _lastWrite = new WeakMap();

const makeTransformStreamDefaultController = (
    writeController,
    readController,
) => {
    const _this = Object.create(TransformStreamDefaultController.prototype);
    _writeController2.set(_this, writeController);
    _readController2.set(_this, readController);
    return _this;
};

class TransformStreamDefaultController {
    constructor() {
        throw new TypeError();
    }

    get desiredSize() {
        return _readController2.get(this).desiredSize;
    }
    enqueue(chunk) {
        const ret = _readController2.get(this).enqueue(chunk);
        _lastWrite.set(this, ret);
        return ret;
    }
    error(reason) {
        _writeController2.get(this).error(reason);
        _readController2.get(this).error(reason);
    }
    terminate() {
        _writeController2.get(this).error();
        _readController2.get(this).close();
    }
}

class WritableStreamDefaultWriter {
    constructor(stream) {}

    get closed() {
        return Promise.resolve();
    }
    get desiredSize() {
        return 0;
    }
    get ready() {
        return Promise.resolve();
    }

    abort(reason) {}
    close() {}
    releaseLock() {}
    write(chunk) {}
}

if (!globalThis.WritableStream) globalThis.WritableStream = WritableStream;
if (!globalThis.TransformStream) globalThis.TransformStream = TransformStream;

if (!ReadableStream.prototype.pipeThrough)
    ReadableStream.prototype.pipeThrough = function ({ writable, readable }) {
        this.pipeTo(writable);
        return readable;
    };

if (!ReadableStream.prototype.pipeTo)
    ReadableStream.prototype.pipeTo = async function (writable) {
        let writerThrew = false;
        const writer = writable.getWriter();
        try {
            const reader = this.getReader();
            for (let value; !({ value } = await reader.read()).done; ) {
                try {
                    await writer.write(value);
                } catch (e) {
                    writerThrew = true;
                    reader.close();
                    throw e;
                }
            }
        } catch (e) {
            if (!writerThrew) writer.abort(e);
            throw e;
        }
        writer.close();
    };
