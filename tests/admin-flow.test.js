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
    created_at: "2026-09-05T12:00:00Z",
    event_slug: "starwest-2026",
    full_name: "Ada Lovelace",
    company: "Analytical Engines",
    role: "QA lead",
    solved_puzzles: [],
    prize_granted: null,
    prize_granted_at: null,
    updated_at: "2026-09-05T12:00:00Z",
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
        prize_granted_at: "2026-09-05T12:05:00Z",
      };
      return response(204);
    }

    if (url.includes("/rest/v1/registrations")) {
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

  dom.window.close();
});
