// HACK: import.meta.url does not work with webpack
export const baseUrl = String(
    new URL(".", new Error().stack.match(/(?:https?|file|blob):\/\/.+/)),
);
