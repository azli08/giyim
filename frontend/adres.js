const addressApiHost = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.hostname
  : "localhost";
const addressApiBase = (window.MODA_API_URL || `http://${addressApiHost}:3000/api`).replace(/\/$/, "");

const requestAddressApi = async (path, options = {}) => {
  const response = await fetch(`${addressApiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  let data = {};
  try { data = await response.json(); } catch { /* Use the status code if the server returned no JSON. */ }
  if (!response.ok) {
    const error = new Error(data.error || "İşlem tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return data;
};

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("#address-form");
  if (!form) return;
  const feedback = document.querySelector(".address-feedback");
  const submit = form.querySelector(".address-submit");
  const savedAddresses = document.querySelector("#saved-addresses");
  const savedAddressList = document.querySelector("#saved-address-list");
  const orderItems = document.querySelector("#address-order-items");
  const orderTotal = document.querySelector("#address-order-total");
  const phoneInput = form.elements.phone;
  const postalCodeInput = form.elements.postalCode;
  let addresses = [];

  postalCodeInput.addEventListener("input", () => {
    postalCodeInput.value = postalCodeInput.value.replace(/\D/g, "").slice(0, 5);
  });

  phoneInput.addEventListener("input", () => {
    let cleaned = phoneInput.value.replace(/[^+()\d\s.-]/g, "").slice(0, 24);
    const digits = cleaned.match(/\d/g) || [];
    const maxDigits = digits.join("").startsWith("90") ? 12 : digits[0] === "0" ? 11 : 10;
    if (digits.length > maxDigits) {
      let keptDigits = 0;
      cleaned = cleaned.replace(/\d/g, (digit) => (++keptDigits <= maxDigits ? digit : ""));
    }
    if (phoneInput.value !== cleaned) phoneInput.value = cleaned;
    const normalizedDigits = (cleaned.match(/\d/g) || []).join("");
    const validTurkishNumber = normalizedDigits.length === 10
      || (normalizedDigits.length === 11 && normalizedDigits.startsWith("0"))
      || (normalizedDigits.length === 12 && normalizedDigits.startsWith("90"));
    phoneInput.setCustomValidity(cleaned && !validTurkishNumber
      ? "Türkiye telefon numarası 10 rakam, 0 ile başlıyorsa 11 veya 90 ile başlıyorsa 12 rakam olmalı."
      : "");
  });

  const showFeedback = (message, state = "") => {
    feedback.textContent = message;
    feedback.dataset.state = state;
  };
  const renderAddresses = () => {
    savedAddressList.replaceChildren(...addresses.map((address) => {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = `${address.title}${address.isDefault ? " · Varsayılan" : ""}`;
      item.append(heading, document.createElement("br"), document.createTextNode(`${address.recipientName} · ${address.phone}`), document.createElement("br"), document.createTextNode(`${address.addressLine}, ${address.district}, ${address.city}${address.postalCode ? ` ${address.postalCode}` : ""}`));
      return item;
    }));
    savedAddresses.hidden = addresses.length === 0;
  };

  const user = await (window.MODA_AUTH_READY || Promise.resolve(null));
  if (!user) {
    window.location.assign("./giris.html?next=adres.html");
    return;
  }

  try {
    const [addressResult, cart] = await Promise.all([
      requestAddressApi("/addresses"),
      requestAddressApi("/cart"),
    ]);
    addresses = addressResult.addresses || [];
    renderAddresses();
    form.elements.isDefault.checked = addresses.length === 0;
    const items = Array.isArray(cart.items) ? cart.items : [];
    orderItems.replaceChildren(...(items.length ? items.map((item) => {
      const row = document.createElement("li");
      const details = document.createElement("span");
      details.textContent = `${item.name} · ${item.size} (${item.quantity} adet)`;
      const amount = document.createElement("span");
      amount.textContent = window.MODA_I18N?.money(item.lineTotal) || `${item.lineTotal} ₺`;
      row.append(details, amount);
      return row;
    }) : [Object.assign(document.createElement("li"), { textContent: "Sepetinde henüz ürün yok." })]));
    orderTotal.textContent = window.MODA_I18N?.money(cart.total) || `${cart.total || 0} ₺`;
  } catch (error) {
    if (error.status === 401) {
      window.location.assign("./giris.html?next=adres.html");
      return;
    }
    showFeedback(error.message || "Adres bilgileri yüklenemedi.", "error");
    orderItems.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Sepet özeti şu anda yüklenemedi." }));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);
    payload.isDefault = form.elements.isDefault.checked;
    submit.disabled = true;
    showFeedback("Adres kaydediliyor…", "loading");
    try {
      const { address } = await requestAddressApi("/addresses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (address.isDefault) addresses = addresses.map((saved) => ({ ...saved, isDefault: false }));
      addresses.unshift(address);
      renderAddresses();
      form.reset();
      form.elements.isDefault.checked = false;
      showFeedback("Adresin hesabına kaydedildi ♥", "success");
    } catch (error) {
      if (error.status === 401) {
        window.location.assign("./giris.html?next=adres.html");
        return;
      }
      showFeedback(error.message || "Adres kaydedilemedi. Lütfen tekrar dene.", "error");
    } finally {
      submit.disabled = false;
    }
  });
});
