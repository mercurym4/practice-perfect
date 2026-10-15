const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness({ withButton = true, withNav = true } = {}) {
  const documentListeners = {};
  const windowListeners = {};
  const buttonListeners = {};
  const linkListeners = {};
  const attributes = { 'aria-expanded': 'false', 'aria-label': 'Open menu' };
  const classes = new Set();
  const button = {
    addEventListener: (name, fn) => { buttonListeners[name] = fn; },
    setAttribute: (name, value) => { attributes[name] = value; }
  };
  const link = { addEventListener: (name, fn) => { linkListeners[name] = fn; } };
  const nav = { querySelectorAll: selector => {
    assert.equal(selector, 'a');
    return [link];
  }};
  const document = {
    body: { classList: {
      toggle: name => classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true),
      remove: name => classes.delete(name)
    }},
    querySelector: selector => selector === '.mobile-menu-toggle' && withButton ? button : null,
    getElementById: id => id === 'site-nav' && withNav ? nav : null,
    addEventListener: (name, fn) => { documentListeners[name] = fn; }
  };
  const window = {
    innerWidth: 390,
    addEventListener: (name, fn) => { windowListeners[name] = fn; }
  };
  vm.runInNewContext(fs.readFileSync('mobile-menu.js', 'utf8'), { document, window });
  return { documentListeners, windowListeners, buttonListeners, linkListeners, attributes, classes, window };
}

const menu = harness();
menu.buttonListeners.click();
assert.equal(menu.classes.has('menu-open'), true);
assert.deepEqual(menu.attributes, { 'aria-expanded': 'true', 'aria-label': 'Close menu' });
menu.buttonListeners.click();
assert.equal(menu.classes.has('menu-open'), false);
assert.deepEqual(menu.attributes, { 'aria-expanded': 'false', 'aria-label': 'Open menu' });

menu.buttonListeners.click();
menu.linkListeners.click();
assert.equal(menu.classes.has('menu-open'), false);
menu.buttonListeners.click();
menu.documentListeners.keydown({ key: 'Enter' });
assert.equal(menu.classes.has('menu-open'), true);
menu.documentListeners.keydown({ key: 'Escape' });
assert.equal(menu.classes.has('menu-open'), false);

menu.buttonListeners.click();
menu.window.innerWidth = 980;
menu.windowListeners.resize();
assert.equal(menu.classes.has('menu-open'), true);
menu.window.innerWidth = 981;
menu.windowListeners.resize();
assert.equal(menu.classes.has('menu-open'), false);

assert.doesNotThrow(() => harness({ withButton: false }));
assert.doesNotThrow(() => harness({ withNav: false }));
console.log('Mobile-menu checks passed: toggle, ARIA labels, link close, Escape, 980px boundary, and missing-element guard.');
