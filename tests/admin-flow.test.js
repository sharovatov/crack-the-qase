const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch {
  JSDOM = null;
}

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function response(status, body = null) {
  const serialized = body === null ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => serialized,
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for the admin UI.");
}

test("staff can find a participant, verify a puzzle, and record the first prize", {
  skip: JSDOM ? false : "jsdom is not available in this environment",
}, async () => {
  const dom = new JSDOM(read("admin/index.html"), {
    runScripts: "outside-only",
    url: "http://localhost:8000/admin/",
  });
  const { window } = dom;
  if (!window.Element.prototype.replaceChildren) {
    window.Element.prototype.replaceChildren = function replaceChildren(...children) {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
      this.append(...children);
    };
  }
  let registration = {
    id: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-09-25T12:00:00Z",
    event_slug: "starwest-2026",
    full_name: "Ada Lovelace",
    company: "Analytical Engines",
    role: "QA lead",
    email: "ada@example.com",
    solved_puzzles: [],
    prize_granted: null,
    prize_granted_at: null,
    updated_at: "2026-09-25T12:00:00Z",
  };

  window.confirm = () => true;
  window.fetch = async (url, options = {}) => {
    if (url.includes("/auth/v1/token?grant_type=password")) {
      return response(200, {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        user: { email: "staff@example.com" },
      });
    }

    if (url.includes("/rpc/is_booth_staff")) {
      return response(200, true);
    }

    if (url.includes("/rpc/set_puzzle_verification")) {
      const body = JSON.parse(options.body);
      registration = {
        ...registration,
        solved_puzzles: body.is_solved ? [body.puzzle_identifier] : [],
      };
      return response(204);
    }

    if (url.includes("/rpc/set_prize_grant")) {
      const body = JSON.parse(options.body);
      registration = {
        ...registration,
        prize_granted: body.prize_identifier,
        prize_granted_at: "2026-09-25T12:05:00Z",
      };
      return response(204);
    }

    if (url.includes("/rest/v1/registrations")) {
      assert.ok(new URL(url).searchParams.get("select").split(",").includes("email"));
      assert.equal(new URL(url).searchParams.get("created_at"), "gte.2026-09-25T00:00:00-07:00");
      return response(200, [{ ...registration }]);
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  window.eval(read("config.js"));
  window.eval(read("admin/app.js"));

  window.document.querySelector("#staff-email").value = "staff@example.com";
  window.document.querySelector("#staff-password").value = "correct horse battery staple";
  window.document.querySelector("#auth-form").dispatchEvent(new window.Event("submit", {
    bubbles: true,
    cancelable: true,
  }));

  try {
    await waitFor(() => window.document.querySelectorAll(".registration-button").length === 1);
  } catch (error) {
    error.message += ` Auth: ${window.document.querySelector("#auth-status").textContent}`;
    error.message += ` Admin: ${window.document.querySelector("#admin-status").textContent}`;
    throw error;
  }
  assert.equal(window.document.querySelector("#dashboard").hidden, false);
  assert.equal(window.document.querySelectorAll(".registration-button").length, 1);
  assert.equal(window.document.querySelectorAll("[data-puzzle-id]").length, 6);

  assert.equal(window.document.querySelector(".participant-email").textContent, "Email: ada@example.com");

  const firstPuzzle = window.document.querySelector('[data-puzzle-id="01"]');
  firstPuzzle.checked = true;
  firstPuzzle.dispatchEvent(new window.Event("change", { bubbles: true }));

  await waitFor(() => window.document.querySelector(".first-solve-banner"));
  assert.match(window.document.querySelector(".first-solve-banner").textContent, /roll the physical die/i);

  window.document.querySelector('[data-prize-id="book"]').click();

  await waitFor(() => window.document.querySelector(".prize-record strong"));
  assert.equal(window.document.querySelector(".prize-record strong").textContent, "Book");
  assert.equal(registration.solved_puzzles[0], "01");
  assert.equal(registration.prize_granted, "book");

  registration.email = null;
  window.document.querySelector("#recent-button").click();
  await waitFor(() => window.document.querySelector(".participant-email").textContent === "Email: Not provided");

  dom.window.close();
});

test("admin lists, counts, search, raffle, and detail reloads exclude registrations before September 25", {
  skip: JSDOM ? false : "jsdom is not available in this environment",
}, async (t) => {
  const dom = new JSDOM(read("admin/index.html"), {
    runScripts: "outside-only",
    url: "http://localhost:8000/admin/",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const rows = [
    { id: "old", full_name: "Older Participant", created_at: "2026-09-25T06:59:59.999Z" },
    { id: "boundary", full_name: "Midnight Participant", created_at: "2026-09-25T07:00:00Z" },
    { id: "new", full_name: "Newer Participant", created_at: "2026-11-17T12:00:00Z" },
  ].map((row) => ({
    ...row,
    event_slug: "starwest-2026",
    company: "Example",
    role: "Tester",
    solved_puzzles: ["01", "02", "03", "04", "05", "06"],
    prize_granted: null,
  }));
  const requests = [];
  window.fetch = async (url) => {
    const { pathname, searchParams: params } = new URL(url);
    assert.equal(pathname, "/rest/v1/registrations");
    requests.push(params);
    let matches = [...rows];
    const dateFilter = params.get("created_at");
    if (dateFilter) {
      const separator = dateFilter.indexOf(".");
      const operator = dateFilter.slice(0, separator);
      const cutoff = Date.parse(dateFilter.slice(separator + 1));
      assert.ok(["gte", "lt"].includes(operator));
      matches = matches.filter((row) => operator === "gte"
        ? Date.parse(row.created_at) >= cutoff
        : Date.parse(row.created_at) < cutoff);
    }
    if (params.has("id")) {
      matches = matches.filter((row) => `eq.${row.id}` === params.get("id"));
    }
    if (params.has("or")) {
      const term = params.get("or").match(/ilike\.\*([^*]+)\*/)[1].toLowerCase();
      matches = matches.filter((row) => `${row.full_name} ${row.company}`.toLowerCase().includes(term));
    }
    if (params.has("solved_puzzles")) {
      matches = matches.filter((row) => row.solved_puzzles.length === 6);
    }
    return response(200, matches);
  };

  window.eval(read("config.js"));
  window.eval(read("admin/app.js"));
  window.eval('storeSession({ access_token: "test-token", expires_in: 3600 })');

  function expectVisible(ids) {
    assert.deepEqual(
      [...window.document.querySelectorAll(".registration-button")].map((button) => button.dataset.registrationId),
      ids,
    );
    assert.equal(window.document.querySelector("#registration-count").textContent, String(ids.length));
    assert.doesNotMatch(window.document.querySelector("#detail-panel").textContent, /Older Participant/);
  }

  await window.eval('loadRegistrations({ view: "recent" })');
  expectVisible(["boundary", "new"]);
  assert.match(window.document.querySelector("#detail-panel").textContent, /Midnight Participant/);

  await window.eval("reloadSelectedRegistration()");
  expectVisible(["boundary", "new"]);
  assert.equal(requests.at(-1).get("id"), "eq.boundary");
  assert.equal(requests.at(-1).get("created_at"), "gte.2026-09-25T00:00:00-07:00");

  await window.eval('loadRegistrations({ view: "recent", query: "Participant" })');
  expectVisible(["boundary", "new"]);
  await window.eval('loadRegistrations({ view: "recent", query: "Older" })');
  expectVisible([]);
  assert.match(window.document.querySelector("#detail-panel").textContent, /Select a participant/);

  await window.eval('loadRegistrations({ view: "raffle" })');
  expectVisible(["boundary", "new"]);
  assert.ok(requests.at(-1).has("solved_puzzles"));
});
