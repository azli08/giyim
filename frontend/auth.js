const authLocalApiHost = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.hostname
  : "localhost";
const authApiBaseUrl = (window.MODA_API_URL || `http://${authLocalApiHost}:3000/api`).replace(/\/$/, "");

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
    error.code = data.code;
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
      if (isRegister) {
        setAuthFeedback(feedback, result.message || "Hesabın oluşturuldu. E-posta ve şifrenle giriş yapabilirsin.", "success");
        submitButton.disabled = true;
        return;
      }
      const firstName = result.user?.firstName;
      const welcomeMessage = firstName
        ? `Hoş geldin, ${firstName}! Mağazaya yönlendiriliyorsun…`
        : "Başarılı! Mağazaya yönlendiriliyorsun…";
      setAuthFeedback(feedback, welcomeMessage, "success");
      window.setTimeout(() => {
        const nextPage = new URLSearchParams(window.location.search).get("next");
        const safeNextPage = nextPage && /^[a-z0-9-]+\.html$/.test(nextPage) ? nextPage : "index.html";
        window.location.assign(`./${safeNextPage}`);
      }, 700);
    } catch (error) {
      setAuthFeedback(feedback, error.message || "Sunucuya ulaşılamadı. Biraz sonra tekrar dene.", "error");
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
    }
  });
};

const initEmailVerificationRequest = () => {
  const form = document.querySelector("#email-verification-request-form");
  if (!form) return;
  const feedback = form.querySelector(".auth-feedback");
  const submitButton = form.querySelector(".auth-submit");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submitButton.disabled = true;
    setAuthFeedback(feedback, "Bağlantı gönderiliyor…", "loading");
    try {
      await requestAuth("/auth/email-verification/request", {
        method: "POST",
        body: JSON.stringify({ email: form.elements.email.value }),
      });
      setAuthFeedback(feedback, "Hesabın varsa yeni doğrulama bağlantısı gönderildi. Gelen kutunu kontrol et.", "success");
    } catch (error) {
      setAuthFeedback(feedback, error.message || "Doğrulama bağlantısı gönderilemedi.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
};

const initEmailVerification = () => {
  const feedback = document.querySelector("#email-verification-feedback");
  if (!feedback) return;
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) window.history.replaceState(null, "", window.location.pathname);
  if (!token) {
    setAuthFeedback(feedback, "Doğrulama bağlantısı eksik. Yeni bağlantı isteyebilirsin.", "error");
    return;
  }
  setAuthFeedback(feedback, "E-posta adresin doğrulanıyor…", "loading");
  requestAuth("/auth/email-verification/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  }).then(() => {
    setAuthFeedback(feedback, "E-posta adresin doğrulandı. Mağazaya yönlendiriliyorsun…", "success");
    window.setTimeout(() => window.location.assign("./index.html"), 1000);
  }).catch((error) => {
    setAuthFeedback(feedback, error.message || "Doğrulama bağlantısı geçersiz veya süresi dolmuş.", "error");
  });
};

const initPasswordRecovery = () => {
  const requestForm = document.querySelector("#forgot-password-form");
  if (requestForm) {
    const feedback = requestForm.querySelector(".auth-feedback");
    const submitButton = requestForm.querySelector(".auth-submit");
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requestForm.reportValidity()) return;
      submitButton.disabled = true;
      setAuthFeedback(feedback, "Bağlantı hazırlanıyor…", "loading");
      try {
        await requestAuth("/auth/password-reset/request", {
          method: "POST",
          body: JSON.stringify({ email: requestForm.elements.email.value }),
        });
        setAuthFeedback(feedback, "Eğer bu e-posta bir hesaba kayıtlıysa, yenileme bağlantısı gönderildi.", "success");
      } catch (error) {
        setAuthFeedback(feedback, error.message || "Şifre yenileme isteği gönderilemedi.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const resetForm = document.querySelector("#reset-password-form");
  if (!resetForm) return;
  const feedback = resetForm.querySelector(".auth-feedback");
  const submitButton = resetForm.querySelector(".auth-submit");
  const token = new URLSearchParams(window.location.search).get("token");
  if (token) window.history.replaceState(null, "", window.location.pathname);
  if (!token) {
    setAuthFeedback(feedback, "Şifre yenileme bağlantısı eksik veya geçersiz.", "error");
    submitButton.disabled = true;
    return;
  }

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!resetForm.reportValidity()) return;
    const password = resetForm.elements.password.value;
    if (password !== resetForm.elements.passwordConfirmation.value) {
      setAuthFeedback(feedback, "Şifre alanları birbiriyle aynı olmalı.", "error");
      resetForm.elements.passwordConfirmation.focus();
      return;
    }
    submitButton.disabled = true;
    setAuthFeedback(feedback, "Şifren güncelleniyor…", "loading");
    try {
      await requestAuth("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      resetForm.reset();
      setAuthFeedback(feedback, "Şifren güncellendi. Giriş sayfasına yönlendiriliyorsun…", "success");
      window.setTimeout(() => window.location.assign("./giris.html"), 1300);
    } catch (error) {
      setAuthFeedback(feedback, error.message || "Şifre güncellenemedi.", "error");
      submitButton.disabled = false;
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
    loginLink.innerHTML = `
      <span class="account-icon" aria-hidden="true">♥</span>
      <span>Giriş Yap</span>
      <span class="account-arrow" aria-hidden="true">→</span>
    `;
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
  initPasswordRecovery();
  initEmailVerificationRequest();
  initEmailVerification();
  initAccountLink();
});
