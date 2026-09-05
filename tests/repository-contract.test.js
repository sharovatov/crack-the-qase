const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("participant form has no email field or timed-tournament copy", () => {
  const html = read("play/index.html");

  assert.doesNotMatch(html, /name="email"/i);
  assert.doesNotMatch(html, /timed drops|fastest correct|one winner each day|LoRa|beat the clock/i);
  assert.match(html, /first verified solve/i);
  assert.match(html, /raffle/i);
});

test("admin has staff login, lookup, progress, prize, and raffle controls", () => {
  const html = read("admin/index.html");
  const script = read("admin/app.js");

  assert.match(html, /staff-email/);
  assert.match(html, /Find by name or company/);
  assert.match(html, /Raffle-ready/);
  assert.match(script, /set_puzzle_verification/);
  assert.match(script, /set_prize_grant/);
  assert.match(script, /solved_puzzles/);
});

test("migration preserves public insert-only access and gates staff operations", () => {
  const sql = read("supabase/migrations/20260905163000_add_booth_admin.sql");

  assert.match(sql, /grant insert \(event_slug, full_name, company, role, notice_version\)/i);
  assert.doesNotMatch(sql, /grant insert \([^;]*email/i);
  assert.match(sql, /public\.is_booth_staff\(\)/);
  assert.match(sql, /set_puzzle_verification/);
  assert.match(sql, /set_prize_grant/);
  assert.match(sql, /registrations_event_name_company_key/);
});

test("admin boots to staff login without making a public data request", async () => {
  class FakeElement {
    constructor() {
      this.hidden = false;
      this.textContent = "";
      this.elements = [];
      this.classList = { toggle() {} };
    }

    addEventListener() {}
  }

  const selectors = [
    "#auth-panel",
    "#auth-form",
    "#auth-status",
    "#dashboard",
    "#logout-button",
    "#event-label",
    "#staff-identity",
    "#search-form",
    "#registration-search",
    "#recent-button",
    "#raffle-button",
    "#registrations-heading",
    "#registration-count",
    "#registration-list",
    "#detail-panel",
    "#admin-status",
    "#toast",
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  let fetchCount = 0;
  const context = {
    console,
    document: { querySelector: (selector) => elements.get(selector) },
    fetch: async () => {
      fetchCount += 1;
      throw new Error("Unexpected request");
    },
    localStorage: {
      getItem: () => null,
      removeItem() {},
      setItem() {},
    },
    window: {
      clearTimeout() {},
      confirm: () => false,
      setTimeout: () => 1,
    },
  };

  vm.createContext(context);
  vm.runInContext(read("config.js"), context);
  vm.runInContext(read("admin/app.js"), context);
  await Promise.resolve();

  assert.equal(elements.get("#auth-panel").hidden, false);
  assert.equal(elements.get("#dashboard").hidden, true);
  assert.equal(fetchCount, 0);
});
