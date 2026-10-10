const authApiBaseUrl = (window.MODA_API_URL || "http://localhost:3000/api").replace(/\/$/, "");

const requestAuth = async (path, options = {}) => {
  const response = await fetch(`${authApiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: options.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options.headers,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // API yanıtı JSON değilse durum koduyla anlamlı bir mesaj gösterilir.
  }

  if (!response.ok) {
    const error = new Error(data.error || "İşlem tamamlanamadı. Lütfen tekrar dene.");
    error.status = response.status;
    throw error;
  }

  return data;
};

window.MODA_AUTH_READY = requestAuth("/auth/me")
  .then(({ user }) => user || null)
  .catch(() => null);

const setAuthFeedback = (element, message, state = "") => {
  element.textContent = message;
  element.dataset.state = state;
};

const initAuthForm = () => {
  const form = document.querySelector("#login-form, #register-form");
  if (!form) return;

  const feedback = form.querySelector(".auth-feedback");
  const submitButton = form.querySelector(".auth-submit");
  const isRegister = form.id === "register-form";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthFeedback(feedback, "");

    if (!form.reportValidity()) return;

    const values = Object.fromEntries(new FormData(form));
    if (isRegister && values.password !== values.passwordConfirmation) {
      setAuthFeedback(feedback, "Şifre alanları birbiriyle aynı olmalı.", "error");
      form.elements.passwordConfirmation.focus();
      return;
    }

    const endpoint = isRegister ? "/auth/register" : "/auth/login";
    const payload = isRegister
      ? {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      }
      : { email: values.email, password: values.password };

    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    setAuthFeedback(feedback, isRegister ? "Hesabın oluşturuluyor…" : "Giriş yapılıyor…", "loading");

    try {
      const result = await requestAuth(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const firstName = result.user?.firstName;
      setAuthFeedback(feedback, firstName ? `Hoş geldin, ${firstName}! Mağazaya yönlendiriliyorsun…` : "Başarılı! Mağazaya yönlendiriliyorsun…", "success");
      window.setTimeout(() => {
        window.location.assign("./index.html");
      }, 700);
    } catch (error) {
      setAuthFeedback(feedback, error.message || "Sunucuya ulaşılamadı. Biraz sonra tekrar dene.", "error");
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
    }
  });
};

const initAccountLink = async () => {
  const header = document.querySelector(".site-header");
  const cartArea = header?.querySelector(".cart-area");
  if (!header || !cartArea) return;

  const accountArea = header.querySelector(".account-area") || document.createElement("div");
  if (!accountArea.isConnected) {
    accountArea.className = "account-area";
    const loginLink = document.createElement("a");
    loginLink.className = "account-link";
    loginLink.href = "./giris.html";
    loginLink.innerHTML = '<span class="account-icon" aria-hidden="true">♥</span><span>Giriş Yap</span><span class="account-arrow" aria-hidden="true">→</span>';
    accountArea.append(loginLink);
    header.insertBefore(accountArea, cartArea);
  }

  try {
    const user = await window.MODA_AUTH_READY;
    if (!user) return;

    accountArea.replaceChildren();
    const greeting = document.createElement("span");
    greeting.className = "account-greeting";
    greeting.textContent = `Merhaba, ${user.firstName}`;
    const logoutButton = document.createElement("button");
    logoutButton.className = "account-logout";
    logoutButton.type = "button";
    logoutButton.textContent = "Çıkış";
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      try {
        await requestAuth("/auth/logout", { method: "POST", body: "{}" });
        window.location.reload();
      } catch {
        logoutButton.disabled = false;
      }
    });
    accountArea.append(greeting, logoutButton);
  } catch {
    // Sunucu kapalıyken mağaza kullanılabilir; giriş bağlantısı görünür kalır.
  }
};

document.addEventListener("DOMContentLoaded", () => {
  initAuthForm();
  initAccountLink();
});
