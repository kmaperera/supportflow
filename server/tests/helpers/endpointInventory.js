// Test-only inventory of the actual mounted Express routers and controller refs.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadInventory() {
  const express = require('express');
  const authorizePath = require.resolve('../../src/middleware/authorize');
  const originalAuthorize = require(authorizePath);
  const permissions = new WeakMap();
  require.cache[authorizePath].exports = (...roles) => {
    const handler = originalAuthorize(...roles); permissions.set(handler, roles); return handler;
  };
  const mounts = [];
  const originalUse = express.application.use;
  express.application.use = function (prefix, ...handlers) {
    if (typeof prefix === 'string') for (const handler of handlers.flat(Infinity)) {
      if (handler?.stack) mounts.push({ prefix, router: handler });
    }
    return originalUse.call(this, prefix, ...handlers);
  };
  let app;
  try { app = require('../../src/app'); }
  finally { express.application.use = originalUse; require.cache[authorizePath].exports = originalAuthorize; }
  const authenticate = require('../../src/middleware/authenticate');
  const controllers = new Map();
  for (const module of Object.values(require.cache)) {
    if (module.filename.endsWith('.controller.js')) for (const [name, handler] of Object.entries(module.exports)) {
      controllers.set(handler, path.basename(module.filename) + '.' + name);
    }
  }
  const routes = [];
  for (const { prefix, router } of mounts) {
    const module = Object.values(require.cache).find(item => item.exports === router);
    assert.ok(module?.filename.endsWith('.routes.js'), 'Mounted router must have a route file');
    const globalHandlers = [];
    for (const layer of router.stack) {
      if (!layer.route) { globalHandlers.push(layer.handle); continue; }
      const handlers = [...globalHandlers, ...layer.route.stack.map(item => item.handle)];
      const controller = controllers.get(handlers.at(-1));
      assert.ok(controller, 'Route must end in an exported controller');
      for (const method of Object.keys(layer.route.methods)) {
        const fullPath = prefix + (layer.route.path === '/' ? '' : layer.route.path);
        const roleSets = handlers.filter(handler => permissions.has(handler)).map(handler => permissions.get(handler));
        const roles = roleSets.length ? roleSets.reduce((a, b) => a.filter(role => b.includes(role))) : [];
        routes.push({ method: method.toUpperCase(), path: fullPath, file: path.relative(path.join(__dirname, '../..'), module.filename).replaceAll('\\', '/'),
          auth: handlers.includes(authenticate) ? 'Bearer' : prefix.endsWith('/auth') && ['/refresh', '/logout', '/logout-all'].includes(layer.route.path) ? layer.route.path === '/logout' ? 'Refresh cookie; absence tolerated' : 'Refresh cookie' : 'Public',
          roles: roles.length ? roles.join(', ') : handlers.includes(authenticate) ? 'All authenticated; service policy applies' : '—', controller });
      }
    }
  }
  const keys = routes.map(route => route.method + ' ' + route.path);
  assert.equal(new Set(keys).size, keys.length, 'Duplicate method/path');
  assert.ok(routes.every(route => route.path.startsWith('/api/v1/')), 'API prefix');
  const routeFiles = [];
  function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (file.endsWith('.routes.js')) routeFiles.push(file);
  } }
  walk(path.join(__dirname, '../../src'));
  assert.equal(new Set(routes.map(route => route.file)).size, routeFiles.length, 'Every route file mounted');
  return { app, routes };
}

function matchRoute(routes, method, url) {
  const pathname = url.split('?')[0];
  return routes.find(route => route.method === method && new RegExp('^' + route.path.replace(/:[^/]+/g, '[^/]+') + '/?$').test(pathname));
}
module.exports = { loadInventory, matchRoute };
