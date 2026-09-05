const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "config.js"), "utf8");
const playSource = fs.readFileSync(path.join(root, "play/app.js"), "utf8");

class FakeClassList {
  add() {}
}

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.href = "";
    this.listeners = new Map();
    this.classList = new FakeClassList();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  checkValidity() {
    return true;
  }

  reportValidity() {}

  focus() {}

  async dispatch(type) {
    await this.listeners.get(type)?.({ preventDefault() {} });
  }
}

function createPlayContext(response) {
  const form = new FakeElement();
  const button = new FakeElement();
  const buttonLabel = new FakeElement();
  const formStatus = new FakeElement();
  const successPanel = new FakeElement();
  const puzzleSiteLink = new FakeElement();
  const eventLabel = new FakeElement();
  const eventKicker = new FakeElement();
  const redirects = [];
  const requests = [];

  button.querySelector = (selector) => selector === ".button-label" ? buttonLabel : null;
  form.querySelector = (selector) => selector === "button[type='submit']" ? button : null;

  const elements = new Map([
    ["#registration-form", form],
    ["#form-status", formStatus],
    ["#success-panel", successPanel],
    ["#puzzle-site-link", puzzleSiteLink],
    ["#event-label", eventLabel],
    ["#event-kicker", eventKicker],
  ]);

  const values = {
    website: "",
    full_name: "Ada Lovelace",
    company: "Analytical Engines",
    role: "QA lead",
  };

  const context = {
    console: { error() {} },
    document: {
      querySelector: (selector) => elements.get(selector),
      querySelectorAll: () => [],
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return response;
    },
    FormData: class {
      get(name) {
        return values[name] || "";
      }
    },
    window: {
      location: { assign: (url) => redirects.push(url) },
    },
  };

  vm.createContext(context);
  vm.runInContext(configSource, context);
  vm.runInContext(playSource, context);

  return { form, formStatus, redirects, requests };
}

test("active configuration uses the six external puzzle numbers", () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(configSource, context);

  assert.deepEqual(
    Array.from(context.window.CRACK_THE_QASE_CONFIG.puzzles),
    ["01", "02", "03", "04", "05", "06"],
  );
  assert.equal(context.window.CRACK_THE_QASE_CONFIG.cheapPrizes.length, 6);
});

test("successful registration omits email and redirects to the puzzle site", async () => {
  const response = { ok: true, status: 201, json: async () => ({}) };
  const { form, redirects, requests } = createPlayContext(response);

  await form.dispatch("submit");

  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(Object.keys(body).sort(), [
    "company",
    "event_slug",
    "full_name",
    "notice_version",
    "role",
  ]);
  assert.equal("email" in body, false);
  assert.deepEqual(redirects, ["https://crack-the-qase.fly.dev"]);
});

test("duplicate name and company also redirects to the puzzle site", async () => {
  const response = {
    ok: false,
    status: 409,
    json: async () => ({ code: "23505", message: "duplicate" }),
  };
  const { form, redirects } = createPlayContext(response);

  await form.dispatch("submit");

  assert.deepEqual(redirects, ["https://crack-the-qase.fly.dev"]);
});

test("failed registration stays on the page and shows an error", async () => {
  const response = {
    ok: false,
    status: 500,
    json: async () => ({ message: "database unavailable" }),
  };
  const { form, formStatus, redirects } = createPlayContext(response);

  await form.dispatch("submit");

  assert.deepEqual(redirects, []);
  assert.match(formStatus.textContent, /couldn’t save/i);
});
