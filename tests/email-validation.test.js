const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch {}

test('email validation blocks missing and malformed addresses before submission', {
  skip: JSDOM ? false : 'jsdom is not available in this environment',
}, async () => {
  const root = path.resolve(__dirname, '..');
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'play/index.html'), 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost/play/',
  });
  const { window } = dom;
  let requests = 0;
  window.fetch = async () => { requests++; throw new Error('Unexpected request'); };
  window.eval(fs.readFileSync(path.join(root, 'config.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(root, 'play/app.js'), 'utf8'));
  const form = window.document.querySelector('form');
  form.elements.full_name.value = 'Ada Lovelace';
  form.elements.company.value = 'Analytical Engines';
  form.elements.role.value = 'QA lead';
  for (const value of ['', 'not-an-email', 'ada@example', 'ada @example.com']) {
    form.elements.email.value = value;
    assert.equal(form.checkValidity(), false, value);
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  }
  assert.equal(requests, 0);
  form.elements.email.value = 'ada+booth@example.com';
  assert.equal(form.checkValidity(), true);
  dom.window.close();
});
