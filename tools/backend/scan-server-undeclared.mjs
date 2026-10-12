// Finds identifiers that server.js references but never declares.
//
//   node tools/backend/scan-server-undeclared.mjs
//
// ── Why this exists ────────────────────────────────────────────────────
//
// server.js is one 10,000-line script in a single scope, and function
// declarations hoist across the whole of it. A helper declared at the very
// bottom is callable from the very top, which is convenient right up until
// somebody deletes the bottom.
//
// That is exactly what happened when the GEU growth prototype came out.
// resolveOwnCurrency was declared inside the deleted block and called by
// POST /api/assets/claim-interest, which survives. Nothing failed at build
// time and nothing could have: `node --check` validates syntax, and the
// call site's syntax was never in question. The gap existed only at request
// time, where it surfaced as
//
//   ReferenceError: resolveOwnCurrency is not defined
//
// a 500 to the caller, and a claim that paid nothing while reporting
// `claimed=undefined`. A test against a live database caught it. Nothing
// cheaper would have.
//
// So this is the cheap thing. It parses the file, collects every binding
// and every reference, and reports the difference. It needs no database, no
// network and no server boot, and it runs in about a second.
//
// It mirrors tools/frontend/scan-undeclared.mjs, which does the same job for
// the concatenated bundle for the same reason — one shared scope, where an
// undeclared name is a guaranteed runtime error rather than a style question.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// rollup is a devDependency of gloobal-essentials-preview, not of the repo
// root. Resolved through that package.json for the same reason the frontend
// scanner does it: a static import would look in this file's own directory,
// which has no node_modules.
const require_ = createRequire(new URL("../../gloobal-essentials-preview/package.json", import.meta.url));
const { parseAst } = require_("rollup/parseAst");

// Node's own globals, plus the handful of web APIs the server legitimately
// touches. Anything not here and not declared in the file is a real finding.
const KNOWN_GLOBALS = new Set([
  "console", "process", "require", "module", "exports", "__dirname", "__filename",
  "Buffer", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate",
  "clearImmediate", "queueMicrotask", "structuredClone", "globalThis", "global",
  "Promise", "JSON", "Math", "Date", "Object", "Array", "String", "Number", "Boolean",
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError",
  "RegExp", "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Symbol", "BigInt",
  "Proxy", "Reflect", "Intl", "Infinity", "NaN", "undefined",
  "isNaN", "isFinite", "parseInt", "parseFloat",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "escape", "unescape",
  "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "AbortController", "AbortSignal",
  "fetch", "Headers", "Request", "Response", "FormData", "Blob", "File",
  "crypto", "performance", "Uint8Array", "Uint16Array", "Uint32Array", "Int8Array",
  "Int16Array", "Int32Array", "Float32Array", "Float64Array", "BigInt64Array",
  "BigUint64Array", "Uint8ClampedArray", "ArrayBuffer", "SharedArrayBuffer", "DataView",
  "Atomics", "Function", "arguments", "eval",
]);

function declarePattern(node, declared) {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      declared.add(node.name);
      break;
    case "ObjectPattern":
      node.properties.forEach((p) => declarePattern(p.type === "RestElement" ? p.argument : p.value, declared));
      break;
    case "ArrayPattern":
      node.elements.forEach((e) => declarePattern(e, declared));
      break;
    case "AssignmentPattern":
      declarePattern(node.left, declared);
      break;
    case "RestElement":
      declarePattern(node.argument, declared);
      break;
  }
}

// Deliberately scope-blind: every binding anywhere in the file counts as
// declared. That makes this incapable of reporting a shadowing or
// use-before-declaration problem, and incapable of a false positive on one
// — which is the trade worth making. The failure it is built for is a name
// with NO binding anywhere, and on that it cannot be wrong.
export function undeclaredIn(filePath) {
  const ast = parseAst(readFileSync(filePath, "utf8"));
  const declared = new Set();
  const referenced = new Map(); // name -> first line seen

  const visit = (node, parent) => {
    if (!node || typeof node.type !== "string") return;

    switch (node.type) {
      case "VariableDeclarator":
        declarePattern(node.id, declared);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id) declared.add(node.id.name);
        node.params.forEach((p) => declarePattern(p, declared));
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) declared.add(node.id.name);
        break;
      case "CatchClause":
        declarePattern(node.param, declared);
        break;
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
        declared.add(node.local.name);
        break;
      case "Identifier": {
        // `{ key: value }` — the key is not a reference.
        const isObjectKey = parent?.type === "Property" && parent.key === node && !parent.computed;
        // `a.b` — `b` is not a reference.
        const isMemberProperty = parent?.type === "MemberExpression" && parent.property === node && !parent.computed;
        // `class { method() {} }` — the name is not a reference.
        const isClassMember = (parent?.type === "MethodDefinition" || parent?.type === "PropertyDefinition")
          && parent.key === node && !parent.computed;
        // `break outer;` — a label is not a reference.
        const isLabel = parent?.type === "LabeledStatement"
          || parent?.type === "BreakStatement"
          || parent?.type === "ContinueStatement";
        if (!isObjectKey && !isMemberProperty && !isClassMember && !isLabel && !referenced.has(node.name)) {
          referenced.set(node.name, node.start);
        }
        break;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((c) => c && typeof c === "object" && visit(c, node));
      } else if (child && typeof child === "object" && typeof child.type === "string") {
        visit(child, node);
      }
    }
  };

  visit(ast, null);

  const src = readFileSync(filePath, "utf8");
  const lineOf = (offset) => src.slice(0, offset).split("\n").length;

  return [...referenced]
    .filter(([name]) => !declared.has(name) && !KNOWN_GLOBALS.has(name))
    .map(([name, offset]) => ({ name, line: lineOf(offset) }))
    .sort((a, b) => a.line - b.line);
}

const TARGET = fileURLToPath(new URL("../../server/server.js", import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = undeclaredIn(process.argv[2] || TARGET);
  if (!findings.length) {
    console.log("Every identifier server.js references is declared somewhere in it.");
    process.exit(0);
  }
  console.log(`${findings.length} undeclared identifier(s) — each one is a ReferenceError waiting for the route that uses it:\n`);
  for (const { name, line } of findings) console.log(`  server.js:${line}  ${name}`);
  process.exit(1);
}
