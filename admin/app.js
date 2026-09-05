const config = window.CRACK_THE_QASE_CONFIG;

if (!config) {
  throw new Error("Crack the Qase configuration failed to load.");
}

const SESSION_KEY = "crack-the-qase-staff-session";
const REGISTRATION_FIELDS = [
  "id",
  "created_at",
  "event_slug",
  "full_name",
  "company",
  "role",
  "solved_puzzles",
  "prize_granted",
  "prize_granted_at",
  "updated_at",
].join(",");

const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authStatus = document.querySelector("#auth-status");
const dashboard = document.querySelector("#dashboard");
const logoutButton = document.querySelector("#logout-button");
const eventLabel = document.querySelector("#event-label");
const staffIdentity = document.querySelector("#staff-identity");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#registration-search");
const recentButton = document.querySelector("#recent-button");
const raffleButton = document.querySelector("#raffle-button");
const registrationsHeading = document.querySelector("#registrations-heading");
const registrationCount = document.querySelector("#registration-count");
const registrationList = document.querySelector("#registration-list");
const detailPanel = document.querySelector("#detail-panel");
const adminStatus = document.querySelector("#admin-status");
const toast = document.querySelector("#toast");

let session = readStoredSession();
let registrations = [];
let selectedRegistrationId = null;
let activeView = "recent";
let mutationPending = false;
let prizeCorrectionOpen = false;
let refreshPromise = null;
let toastTimer = null;

eventLabel.textContent = `${config.eventName} · ${config.boothLabel}`;

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function storeSession(nextSession) {
  const expiresAt = nextSession.expires_at
    ? nextSession.expires_at * 1000
    : Date.now() + (nextSession.expires_in || 3600) * 1000;

  session = {
    accessToken: nextSession.access_token,
    refreshToken: nextSession.refresh_token,
    expiresAt,
    email: nextSession.user?.email || session?.email || "Staff account",
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

async function parseResponseError(response) {
  try {
    const body = await response.json();
    return body.error_description || body.message || body.details || body.hint || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

async function refreshSession() {
  if (!session?.refreshToken) {
    throw new Error("Your staff session has expired. Sign in again.");
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(await parseResponseError(response));
      }

      const nextSession = await response.json();
      storeSession(nextSession);
      return session.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function getAccessToken(forceRefresh = false) {
  if (!session) {
    throw new Error("Sign in to continue.");
  }

  if (forceRefresh || session.expiresAt - Date.now() < 60_000) {
    return refreshSession();
  }

  return session.accessToken;
}

async function staffRequest(path, options = {}, mayRetry = true) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 && mayRetry) {
    await getAccessToken(true);
    return staffRequest(path, options, false);
  }

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function requireStaffAccess() {
  const isStaff = await staffRequest("/rest/v1/rpc/is_booth_staff", {
    method: "POST",
    body: "{}",
  });

  if (isStaff !== true) {
    throw new Error("This account is not allowlisted for booth access.");
  }
}

function setAuthBusy(isBusy) {
  for (const control of authForm.elements) {
    control.disabled = isBusy;
  }
  authForm.setAttribute("aria-busy", String(isBusy));
}

function showSignedOut(message = "") {
  authPanel.hidden = false;
  dashboard.hidden = true;
  logoutButton.hidden = true;
  authStatus.textContent = message;
  registrations = [];
  selectedRegistrationId = null;
}

function showSignedIn() {
  authPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  staffIdentity.textContent = session.email;
}

function setView(nextView) {
  activeView = nextView;
  const isRecent = nextView === "recent";
  recentButton.classList.toggle("is-active", isRecent);
  recentButton.setAttribute("aria-pressed", String(isRecent));
  raffleButton.classList.toggle("is-active", !isRecent);
  raffleButton.setAttribute("aria-pressed", String(!isRecent));
  registrationsHeading.textContent = isRecent ? "Recent registrations" : "Raffle-ready";
}

function normalizedSolvedPuzzles(registration) {
  return Array.isArray(registration.solved_puzzles)
    ? [...new Set(registration.solved_puzzles)]
    : [];
}

function isRaffleEligible(registration) {
  const solved = new Set(normalizedSolvedPuzzles(registration));
  return config.puzzles.every((puzzleId) => solved.has(puzzleId));
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function prizeLabel(prizeId) {
  return config.cheapPrizes.find((prize) => prize.id === prizeId)?.label || prizeId || "None";
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function renderRegistrationList() {
  registrationList.replaceChildren();
  registrationCount.textContent = String(registrations.length);

  if (registrations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = activeView === "raffle"
      ? "Nobody has verified every puzzle yet."
      : "No matching registrations found.";
    registrationList.append(empty);
    return;
  }

  for (const registration of registrations) {
    const solvedCount = normalizedSolvedPuzzles(registration).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "registration-button";
    button.dataset.registrationId = registration.id;
    button.classList.toggle("is-selected", registration.id === selectedRegistrationId);

    const name = document.createElement("span");
    name.className = "registration-name";
    name.textContent = registration.full_name;

    const company = document.createElement("span");
    company.className = "registration-company";
    company.textContent = `${registration.company} · ${registration.role}`;

    const awardedPrize = document.createElement("span");
    awardedPrize.className = "registration-prize";
    awardedPrize.textContent = registration.prize_granted
      ? `Prize: ${prizeLabel(registration.prize_granted)}`
      : "No prize recorded";

    const summary = document.createElement("span");
    summary.className = "registration-summary";

    const time = document.createElement("span");
    time.textContent = formatTime(registration.created_at);

    const progress = document.createElement("span");
    progress.className = isRaffleEligible(registration) ? "eligible-chip" : "progress-chip";
    progress.textContent = isRaffleEligible(registration)
      ? "Raffle-ready"
      : `${solvedCount}/${config.puzzles.length}`;

    summary.append(time, progress);
    button.append(name, company, awardedPrize, summary);
    registrationList.append(button);
  }
}

function createSectionHeading(title, description) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("h3");
  heading.textContent = title;
  const text = document.createElement("p");
  text.className = "section-description";
  text.textContent = description;
  fragment.append(heading, text);
  return fragment;
}

function selectedRegistration() {
  return registrations.find((registration) => registration.id === selectedRegistrationId) || null;
}

function renderDetail() {
  const registration = selectedRegistration();

  if (!registration) {
    detailPanel.innerHTML = `
      <div class="empty-detail">
        <p class="empty-mark" aria-hidden="true">⌁</p>
        <h2>Select a participant</h2>
        <p>Choose someone from the list to verify their puzzles.</p>
      </div>
    `;
    return;
  }

  detailPanel.replaceChildren();
  const solved = normalizedSolvedPuzzles(registration);

  const heading = document.createElement("div");
  heading.className = "participant-heading";
  const headingCopy = document.createElement("div");
  const name = document.createElement("h2");
  name.textContent = registration.full_name;
  const meta = document.createElement("p");
  meta.className = "participant-meta";
  meta.textContent = `${registration.company} · ${registration.role}`;
  headingCopy.append(name, meta);
  const progress = document.createElement("span");
  progress.className = "progress-large";
  progress.textContent = `${solved.length} of ${config.puzzles.length} verified`;
  heading.append(headingCopy, progress);
  detailPanel.append(heading);

  if (isRaffleEligible(registration)) {
    const completion = document.createElement("p");
    completion.className = "completion-banner";
    completion.textContent = "All puzzles verified — raffle-eligible if present at the booth.";
    detailPanel.append(completion);
  } else if (solved.length > 0 && !registration.prize_granted) {
    const firstSolve = document.createElement("p");
    firstSolve.className = "first-solve-banner";
    firstSolve.textContent = "First solve verified. Roll the physical die, record the prize below, then hand it over.";
    detailPanel.append(firstSolve);
  }

  const puzzlesSection = document.createElement("section");
  puzzlesSection.className = "detail-section";
  puzzlesSection.append(createSectionHeading(
    "Verified puzzles",
    "Tick a puzzle only after the participant explains the solution in person.",
  ));

  const puzzleGrid = document.createElement("div");
  puzzleGrid.className = "puzzle-grid";

  for (const puzzleId of config.puzzles) {
    const label = document.createElement("label");
    label.className = "puzzle-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = solved.includes(puzzleId);
    checkbox.disabled = mutationPending;
    checkbox.dataset.puzzleId = puzzleId;
    const labelText = document.createElement("span");
    labelText.className = "puzzle-number";
    labelText.textContent = `Puzzle ${puzzleId}`;
    label.append(checkbox, labelText);
    puzzleGrid.append(label);
  }

  puzzlesSection.append(puzzleGrid);
  detailPanel.append(puzzlesSection);

  const prizeSection = document.createElement("section");
  prizeSection.className = "detail-section";
  prizeSection.append(createSectionHeading(
    "First-solve prize",
    "The physical die decides the prize. Record the item actually handed out.",
  ));

  if (registration.prize_granted && !prizeCorrectionOpen) {
    const record = document.createElement("div");
    record.className = "prize-record";
    const recordCopy = document.createElement("div");
    const value = document.createElement("strong");
    value.textContent = prizeLabel(registration.prize_granted);
    const timestamp = document.createElement("span");
    timestamp.textContent = `Recorded ${formatTime(registration.prize_granted_at)}`;
    recordCopy.append(value, timestamp);
    const correctButton = document.createElement("button");
    correctButton.type = "button";
    correctButton.className = "correction-button";
    correctButton.id = "correct-prize-button";
    correctButton.textContent = "Correct record";
    record.append(recordCopy, correctButton);
    prizeSection.append(record);
  } else if (solved.length === 0 && !registration.prize_granted) {
    const noPrize = document.createElement("p");
    noPrize.className = "section-description";
    noPrize.textContent = "No prize is due until the first puzzle is verified.";
    prizeSection.append(noPrize);
  } else {
    const options = document.createElement("div");
    options.className = "prize-options";

    for (const prize of config.cheapPrizes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prize-button";
      button.disabled = mutationPending;
      button.dataset.prizeId = prize.id;
      const die = document.createElement("span");
      die.className = "die-face";
      die.textContent = String(prize.dieFace);
      const label = document.createElement("span");
      label.textContent = prize.label;
      button.append(die, label);
      options.append(button);
    }

    prizeSection.append(options);

    if (registration.prize_granted) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "correction-button clear-prize-button";
      clearButton.id = "clear-prize-button";
      clearButton.disabled = mutationPending;
      clearButton.textContent = "Clear the prize record";
      prizeSection.append(clearButton);
    }
  }

  detailPanel.append(prizeSection);
}

function sanitizeSearchTerm(value) {
  return value.trim().replace(/[,*()%]/g, " ").replace(/\s+/g, " ");
}

async function loadRegistrations({ view = activeView, query = "" } = {}) {
  setView(view);
  adminStatus.textContent = "Loading registrations…";

  const params = new URLSearchParams({
    select: REGISTRATION_FIELDS,
    event_slug: `eq.${config.eventSlug}`,
    order: "created_at.desc",
    limit: "100",
  });

  if (view === "raffle") {
    params.set("solved_puzzles", `cs.{${config.puzzles.join(",")}}`);
  } else {
    const searchTerm = sanitizeSearchTerm(query);
    if (searchTerm) {
      params.set("or", `(full_name.ilike.*${searchTerm}*,company.ilike.*${searchTerm}*)`);
      registrationsHeading.textContent = "Search results";
    }
  }

  try {
    registrations = await staffRequest(`/rest/v1/registrations?${params.toString()}`);

    if (!registrations.some((registration) => registration.id === selectedRegistrationId)) {
      selectedRegistrationId = registrations[0]?.id || null;
      prizeCorrectionOpen = false;
    }

    renderRegistrationList();
    renderDetail();
    adminStatus.textContent = view === "raffle"
      ? "Completed-puzzle candidates. Confirm they are present before the raffle."
      : "";
  } catch (error) {
    if (error.message.toLowerCase().includes("session") || error.message.toLowerCase().includes("jwt")) {
      clearSession();
      showSignedOut("Your staff session expired. Sign in again.");
      return;
    }

    adminStatus.textContent = error.message;
  }
}

async function reloadSelectedRegistration() {
  if (!selectedRegistrationId) {
    return;
  }

  const params = new URLSearchParams({
    select: REGISTRATION_FIELDS,
    id: `eq.${selectedRegistrationId}`,
    limit: "1",
  });
  const [updatedRegistration] = await staffRequest(`/rest/v1/registrations?${params.toString()}`);

  if (!updatedRegistration) {
    throw new Error("Registration not found.");
  }

  const index = registrations.findIndex((registration) => registration.id === selectedRegistrationId);
  if (index >= 0) {
    registrations[index] = updatedRegistration;
  } else {
    registrations.unshift(updatedRegistration);
  }

  renderRegistrationList();
  renderDetail();
}

async function setPuzzleVerification(puzzleId, isSolved) {
  const registration = selectedRegistration();
  if (!registration || mutationPending) {
    return;
  }

  mutationPending = true;
  renderDetail();

  try {
    await staffRequest("/rest/v1/rpc/set_puzzle_verification", {
      method: "POST",
      body: JSON.stringify({
        registration_id: registration.id,
        puzzle_identifier: puzzleId,
        is_solved: isSolved,
      }),
    });
    await reloadSelectedRegistration();
    showToast(`Puzzle ${puzzleId} ${isSolved ? "verified" : "unmarked"}.`);
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    mutationPending = false;
    renderDetail();
  }
}

async function setPrizeGrant(prizeId) {
  const registration = selectedRegistration();
  if (!registration || mutationPending) {
    return;
  }

  if (registration.prize_granted && prizeId && registration.prize_granted !== prizeId) {
    const confirmed = window.confirm(
      `Change the recorded prize from ${prizeLabel(registration.prize_granted)} to ${prizeLabel(prizeId)}?`,
    );
    if (!confirmed) {
      return;
    }
  }

  if (!prizeId && !window.confirm("Clear this participant’s prize record?")) {
    return;
  }

  mutationPending = true;
  renderDetail();

  try {
    await staffRequest("/rest/v1/rpc/set_prize_grant", {
      method: "POST",
      body: JSON.stringify({
        registration_id: registration.id,
        prize_identifier: prizeId,
        expected_prize_identifier: registration.prize_granted,
      }),
    });
    prizeCorrectionOpen = false;
    await reloadSelectedRegistration();
    showToast(prizeId ? `${prizeLabel(prizeId)} recorded.` : "Prize record cleared.");
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    mutationPending = false;
    renderDetail();
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authStatus.textContent = "";

  if (!authForm.checkValidity()) {
    authForm.reportValidity();
    return;
  }

  const formData = new FormData(authForm);
  setAuthBusy(true);

  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: formData.get("email").trim().toLowerCase(),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      throw new Error(await parseResponseError(response));
    }

    storeSession(await response.json());
    authForm.reset();
    await requireStaffAccess();
    showSignedIn();
    await loadRegistrations({ view: "recent" });
  } catch (error) {
    clearSession();
    authStatus.textContent = error.message;
  } finally {
    setAuthBusy(false);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    if (session) {
      const accessToken = await getAccessToken();
      await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: config.supabasePublishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }
  } finally {
    clearSession();
    showSignedOut();
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadRegistrations({ view: "recent", query: searchInput.value });
});

recentButton.addEventListener("click", () => {
  searchInput.value = "";
  loadRegistrations({ view: "recent" });
});

raffleButton.addEventListener("click", () => {
  searchInput.value = "";
  loadRegistrations({ view: "raffle" });
});

registrationList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-registration-id]");
  if (!button) {
    return;
  }

  selectedRegistrationId = button.dataset.registrationId;
  prizeCorrectionOpen = false;
  renderRegistrationList();
  renderDetail();
});

detailPanel.addEventListener("change", (event) => {
  if (event.target.matches("[data-puzzle-id]")) {
    setPuzzleVerification(event.target.dataset.puzzleId, event.target.checked);
  }
});

detailPanel.addEventListener("click", (event) => {
  const prizeButton = event.target.closest("[data-prize-id]");
  if (prizeButton) {
    setPrizeGrant(prizeButton.dataset.prizeId);
    return;
  }

  if (event.target.closest("#correct-prize-button")) {
    prizeCorrectionOpen = true;
    renderDetail();
    return;
  }

  if (event.target.closest("#clear-prize-button")) {
    setPrizeGrant(null);
  }
});

async function initialize() {
  if (!session) {
    showSignedOut();
    return;
  }

  try {
    await getAccessToken();
    await requireStaffAccess();
    showSignedIn();
    await loadRegistrations({ view: "recent" });
  } catch (error) {
    clearSession();
    showSignedOut(error.message || "Your staff session expired. Sign in again.");
  }
}

initialize();
