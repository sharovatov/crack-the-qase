const config = window.CRACK_THE_QASE_CONFIG;

if (!config) {
  throw new Error("Crack the Qase configuration failed to load.");
}

const form = document.querySelector("#registration-form");
const submitButton = form.querySelector("button[type='submit']");
const buttonLabel = submitButton.querySelector(".button-label");
const formStatus = document.querySelector("#form-status");
const successPanel = document.querySelector("#success-panel");
const puzzleSiteLink = document.querySelector("#puzzle-site-link");
const eventLabel = document.querySelector("#event-label");
const eventKicker = document.querySelector("#event-kicker");

eventLabel.textContent = `${config.eventName} · ${config.boothLabel}`;
eventKicker.textContent = `${config.eventName} · ${config.eventLocation}`;
puzzleSiteLink.href = config.puzzleSiteUrl;

for (const puzzleCount of document.querySelectorAll("[data-puzzle-count]")) {
  puzzleCount.textContent = String(config.puzzles.length);
}

for (const boothLabel of document.querySelectorAll("[data-booth-label]")) {
  boothLabel.textContent = config.boothLabel.toLowerCase();
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  form.setAttribute("aria-busy", String(isSubmitting));
  buttonLabel.textContent = isSubmitting ? "Registering…" : "Open the puzzles";
}

function openPuzzles() {
  form.hidden = true;
  successPanel.hidden = false;
  successPanel.focus();
  window.location.assign(config.puzzleSiteUrl);
}

async function parseError(response) {
  try {
    return await response.json();
  } catch {
    return { message: `Request failed with status ${response.status}.` };
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.textContent = "";
  form.classList.add("was-validated");

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const formData = new FormData(form);

  // Quietly accept bot submissions caught by the honeypot without storing them.
  if (formData.get("website")) {
    openPuzzles();
    return;
  }

  const registration = {
    event_slug: config.eventSlug,
    full_name: formData.get("full_name").trim(),
    company: formData.get("company").trim(),
    role: formData.get("role").trim(),
    notice_version: config.noticeVersion,
  };

  setSubmitting(true);

  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/registrations`, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(registration),
    });

    if (response.ok) {
      openPuzzles();
      return;
    }

    const error = await parseError(response);

    if (response.status === 409 && error.code === "23505") {
      openPuzzles();
      return;
    }

    console.error("Registration failed", error);
    throw new Error(error.message || "Registration failed.");
  } catch (error) {
    console.error(error);
    formStatus.textContent = "We couldn’t save your entry. Check your connection and try again.";
  } finally {
    setSubmitting(false);
  }
});
