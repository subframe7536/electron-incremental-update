export const bytecodeGeneratorScript = 'const vm = require(\'vm\')\n'
  + 'const v8 = require(\'v8\')\n'
  + 'const wrap = require(\'module\').wrap\n'
  + 'v8.setFlagsFromString(\'--no-lazy\')\n'
  + 'v8.setFlagsFromString(\'--no-flush-bytecode\')\n'
  + 'let code = \'\'\n'
  + 'process.stdin.setEncoding(\'utf-8\')\n'
  + 'process.stdin.on(\'readable\', () => {\n'
  + '  const data = process.stdin.read()\n'
  + '  if (data !== null) {\n'
  + '    code += data\n'
  + '  }\n'
  + '})\n'
  + 'process.stdin.on(\'end\', () => {\n'
  + '  try {\n'
  + '    if (typeof code !== \'string\') {\n'
  + '      throw new Error(\'javascript code must be string.\')\n'
  + '    }\n'
  + '    const script = new vm.Script(wrap(code), { produceCachedData: true })\n'
  + '    const bytecodeBuffer = script.createCachedData()\n'
  + '    process.stdout.write(bytecodeBuffer)\n'
  + '  } catch (error) {\n'
  + '    console.error(error)\n'
  + '  }\n'
  + '})\n'

export const bytecodeModuleLoaderCode = [
  `"use strict";`,
  `const fs = require("fs");`,
  `const path = require("path");`,
  `const vm = require("vm");`,
  `const v8 = require("v8");`,
  `const Module = require("module");`,
  `v8.setFlagsFromString("--no-lazy");`,
  `v8.setFlagsFromString("--no-flush-bytecode");`,
  `const FLAG_HASH_OFFSET = 12;`,
  `const SOURCE_HASH_OFFSET = 8;`,
  `let dummyBytecode;`,
  `function setFlagHashHeader(bytecodeBuffer) {`,
  `  if (!dummyBytecode) {`,
  `    const script = new vm.Script("", {`,
  `      produceCachedData: true`,
  `    });`,
  `    dummyBytecode = script.createCachedData();`,
  `  }`,
  `  dummyBytecode.slice(FLAG_HASH_OFFSET, FLAG_HASH_OFFSET + 4).copy(bytecodeBuffer, FLAG_HASH_OFFSET);`,
  `};`,
  `function getSourceHashHeader(bytecodeBuffer) {`,
  `  return bytecodeBuffer.slice(SOURCE_HASH_OFFSET, SOURCE_HASH_OFFSET + 4);`,
  `};`,
  `function buffer2Number(buffer) {`,
  `  let ret = 0;`,
  `  ret |= buffer[3] << 24;`,
  `  ret |= buffer[2] << 16;`,
  `  ret |= buffer[1] << 8;`,
  `  ret |= buffer[0];`,
  `  return ret;`,
  `};`,
  `Module._extensions[".jsc"] = Module._extensions[".cjsc"] = function (module, filename) {`,
  `  const bytecodeBuffer = fs.readFileSync(filename);`,
  `  if (!Buffer.isBuffer(bytecodeBuffer)) {`,
  `    throw new Error("BytecodeBuffer must be a buffer object.");`,
  `  }`,
  `  setFlagHashHeader(bytecodeBuffer);`,
  `  const length = buffer2Number(getSourceHashHeader(bytecodeBuffer));`,
  `  let dummyCode = "";`,
  `  if (length > 1) {`,
  `    dummyCode = "\\"" + "\\u200b".repeat(length - 2) + "\\"";`,
  `  }`,
  `  const script = new vm.Script(dummyCode, {`,
  `    filename: filename,`,
  `    lineOffset: 0,`,
  `    displayErrors: true,`,
  `    cachedData: bytecodeBuffer`,
  `  });`,
  `  if (script.cachedDataRejected) {`,
  `    throw new Error("Invalid or incompatible cached data (cachedDataRejected)");`,
  `  }`,
  `  const require = function (id) {`,
  `    return module.require(id);`,
  `  };`,
  `  require.resolve = function (request, options) {`,
  `    return Module._resolveFilename(request, module, false, options);`,
  `  };`,
  `  if (process.mainModule) {`,
  `    require.main = process.mainModule;`,
  `  }`,
  `  require.extensions = Module._extensions;`,
  `  require.cache = Module._cache;`,
  `  const compiledWrapper = script.runInThisContext({`,
  `    filename: filename,`,
  `    lineOffset: 0,`,
  `    columnOffset: 0,`,
  `    displayErrors: true`,
  `  });`,
  `  const dirname = path.dirname(filename);`,
  `  const args = [module.exports, require, module, filename, dirname, process, global];`,
  `  return compiledWrapper.apply(module.exports, args);`,
  `};`,
].join('\n')
