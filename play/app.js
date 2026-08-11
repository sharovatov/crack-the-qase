const SUPABASE_URL = "https://hbifraiksxfemwgrvltx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_A0xuq3ZTTmKE_YNoao_0Xw_k5jayN2B";
const EVENT_SLUG = "starwest-2026";
const NOTICE_VERSION = "2026-08-11";

const form = document.querySelector("#registration-form");
const submitButton = form.querySelector("button[type='submit']");
const buttonLabel = submitButton.querySelector(".button-label");
const formStatus = document.querySelector("#form-status");
const successPanel = document.querySelector("#success-panel");

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  form.setAttribute("aria-busy", String(isSubmitting));
  buttonLabel.textContent = isSubmitting ? "Joining…" : "Count me in";
}

function showSuccess(alreadyRegistered = false) {
  form.hidden = true;
  successPanel.querySelector("h2").textContent = alreadyRegistered
    ? "You’re already in."
    : "Now come find us.";
  successPanel.hidden = false;
  successPanel.focus();
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
    showSuccess();
    return;
  }

  const registration = {
    event_slug: EVENT_SLUG,
    full_name: formData.get("full_name").trim(),
    company: formData.get("company").trim(),
    role: formData.get("role").trim(),
    email: formData.get("email").trim().toLowerCase(),
    notice_version: NOTICE_VERSION,
  };

  setSubmitting(true);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/registrations`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(registration),
    });

    if (response.ok) {
      showSuccess();
      return;
    }

    const error = await parseError(response);

    if (response.status === 409 && error.code === "23505") {
      showSuccess(true);
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
