// Scheduling/data-change checks use only synthetic state; no API or credentials.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/../src/afrr-market.js', 'utf8');
new vm.Script(source);
const context = {
  Intl, Date, Math, console,
  document: { hidden: true },
  localStorage: { getItem() { return null; } },
  clearTimeout() {},
  setTimeout() { throw Error('Hidden tab must not schedule maintenance'); }
};
vm.createContext(context);
const start = source.indexOf('  const INTERVAL=');
const end = source.indexOf('  async function boot()');
assert(start >= 0 && end > start, 'TenneT module boundaries');
vm.runInContext(source.slice(start, end) + `
  globalThis.workTest = {
    tick, showPower, renderGraph,
    setGraphVisible(value) { graphVisible = value; },
    setHooks(hooks) {
      coordinator = hooks.coordinator;
      loadConfig = hooks.loadConfig;
      render = hooks.render;
      readBids = hooks.readBids;
      readPower = hooks.readPower;
      learnHistory = hooks.learnHistory;
      placementTarget = () => ({});
      customer = () => 'test';
    },
    graphHook(fn) { renderGraph = fn; },
    revision() { return emsRevision; }
  };`, context);
(async () => {
  let reads = 0;
  context.workTest.setHooks({
    loadConfig: async () => { reads++; return { enabled: false }; },
    coordinator: { read: async () => { reads++; return null; } },
    render() {},
    readBids: async () => { reads++; },
    readPower: async () => { reads++; },
    learnHistory: async () => { reads++; }
  });
  await context.workTest.tick();
  assert.equal(reads, 0, 'hidden tick does not read configuration or caches');
  // With no DOM mock, reaching the renderer would throw. Offscreen work must
  // stop before looking up the graph while still allowing visible fallback.
  context.document.hidden = false;
  context.workTest.setGraphVisible(false);
  context.workTest.renderGraph();
  let draws = 0;
  context.workTest.graphHook(() => draws++);
  context.workTest.showPower('test', [{ t: 1, po: 1000 }]);
  const revision = context.workTest.revision();
  context.workTest.showPower('test', [{ t: 1, po: 1000 }]);
  assert.equal(draws, 1, 'same meter series does not redraw');
  assert.equal(context.workTest.revision(), revision, 'same series keeps revision');
  context.workTest.showPower('test', [{ t: 1, po: 2000 }]);
  assert.equal(draws, 2, 'corrected existing point redraws');
  assert.equal(context.workTest.revision(), revision + 1, 'correction advances revision');
  context.workTest.showPower('test', [{ t: 1, po: 2000 }, { t: 2, po: -3000 }]);
  assert.equal(draws, 3, 'new sample redraws');
  context.workTest.showPower('other', [{ t: 3, po: 4000 }]);
  assert.equal(draws, 3, 'other installation is ignored');
  console.log('PASS TenneT work: hidden maintenance pauses; offscreen graph defers; identical rereads skip redraw; corrected/new meter values redraw; installation isolation retained.');
})().catch(error => { console.error(error); process.exitCode = 1; });
