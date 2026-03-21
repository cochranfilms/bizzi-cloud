/**
 * Registers @/ path alias so scripts can require() app modules.
 * Must be loaded before any script that requires from @/ or src/lib.
 */
const path = require("path");
const Module = require("module");

const projectRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(projectRoot, "src");

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(srcRoot, request.slice(2));
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};
