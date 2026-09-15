const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function cssTokens(css) {
  const tokens = {};
  for (const match of css.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim().toLowerCase();
  }
  return tokens;
}

// The registration page is the reference palette: brand black, paper, violet
// accent, blue secondary accent and brand purple, as in the Qase brand guide.
const REGISTRATION_PALETTE = new Set([
  "#0f172a", // brand black (--ink)
  "#f6f4eb", // paper
  "#c8b0ff", // violet accent
  "#b5d2ff", // blue secondary accent
  "#4f46dc", // brand purple
  "#1a1636", // deep purple
  "#a8aea1", // muted copy
]);

const LEGACY_COLOURS = ["#d7ff45", "#efffb3", "#0d0d0d", "#f4f1ea", "#a9a69f", "215 255 69"];

test("homepage stylesheet shares the registration page's brand tokens", () => {
  const home = cssTokens(read("styles.css"));
  const play = cssTokens(read("play/styles.css"));

  for (const name of ["accent", "accent-secondary", "brand-purple", "brand-deep", "ink", "paper", "muted", "line"]) {
    assert.equal(home[name], play[name], `--${name} differs from play/styles.css`);
  }
  assert.equal(home.ink, "#0f172a");
  assert.equal(home["brand-purple"], "#4f46dc");
});

test("homepage stylesheet uses only registration-page colours", () => {
  const css = read("styles.css").toLowerCase();

  for (const legacy of LEGACY_COLOURS) {
    assert.equal(css.includes(legacy), false, `legacy colour ${legacy} is still present`);
  }
  for (const match of css.matchAll(/#[0-9a-f]{6}\b/g)) {
    assert.ok(REGISTRATION_PALETTE.has(match[0]), `${match[0]} is not part of the registration-page palette`);
  }
});

test("homepage and 404 theme-color match the brand black", () => {
  for (const page of ["index.html", "404.html"]) {
    const match = read(page).match(/<meta name="theme-color" content="([^"]+)">/);
    assert.ok(match, `${page} declares a theme-color`);
    assert.equal(match[1].toLowerCase(), "#0f172a", `${page} theme-color`);
  }
});

test("homepage primary action uses the accent fill with a brand-purple hover", () => {
  const css = read("styles.css").replace(/\s+/g, " ");
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = (selector) => {
    const match = css.match(new RegExp(`(?:^|}) ?${escape(selector)} ?{([^}]*)}`));
    assert.ok(match, `rule for ${selector} exists`);
    return match[1];
  };

  assert.match(rule(".eyebrow"), /color: var\(--accent\)/);
  assert.match(rule("h1 span"), /color: var\(--accent\)/);
  assert.match(rule(".primary-link"), /background: var\(--accent\)/);
  assert.match(rule(".primary-link"), /color: var\(--ink\)/);

  const hover = rule(".primary-link:hover, .primary-link:focus-visible");
  assert.match(hover, /background: var\(--brand-purple\)/);
  assert.match(hover, /color: var\(--paper\)/);
});
