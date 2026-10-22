const addressApiHost = ["localhost", "127.0.0.1"].includes(window.location.hostname) ? window.location.hostname : "localhost";
const addressApiBase = (window.MODA_API_URL || `http://${addressApiHost}:3000/api`).replace(/\/$/, "");

const requestAddressApi = async (path, options = {}) => {
  const response = await fetch(`${addressApiBase}${path}`, {
    ...options, credentials: "include",
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  let data = {};
  try { data = await response.json(); } catch { /* Fall back to a status-based error. */ }
  if (!response.ok) { const error = new Error(data.error || "İşlem tamamlanamadı."); error.status = response.status; throw error; }
  return data;
};

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("#address-form");
  if (!form) return;
  const feedback = form.querySelector(".address-feedback");
  const submit = form.querySelector(".address-submit");
  const savedAddresses = document.querySelector("#saved-addresses");
  const savedAddressList = document.querySelector("#saved-address-list");
  const orderItems = document.querySelector("#address-order-items");
  const orderTotal = document.querySelector("#address-order-total");
  const phoneInput = form.elements.phone;
  const postalCodeInput = form.elements.postalCode;
  const continueLink = document.querySelector("#continue-to-payment");
  const cancelEdit = document.querySelector("#cancel-address-edit");
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
  let editingId = null;

  const showFeedback = (message, state = "") => { feedback.textContent = message; feedback.dataset.state = state; };
  const renderAddresses = () => {
    savedAddressList.replaceChildren(...addresses.map((address) => {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = `${address.title}${address.isDefault ? " · Varsayılan" : ""}`;
      const details = document.createElement("p");
      details.textContent = `${address.recipientName} · ${address.phone} · ${address.addressLine}, ${address.district}, ${address.city}${address.postalCode ? ` ${address.postalCode}` : ""}`;
      const actions = document.createElement("div"); actions.className = "saved-address-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Düzenle";
      edit.addEventListener("click", () => beginEdit(address));
      const defaultButton = document.createElement("button"); defaultButton.type = "button";
      defaultButton.textContent = address.isDefault ? "Varsayılanı kaldır" : "Varsayılan yap";
      defaultButton.addEventListener("click", () => toggleDefault(address));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Sil"; remove.className = "is-danger";
      remove.addEventListener("click", () => deleteAddress(address));
      actions.append(edit, defaultButton, remove);
      item.append(heading, details, actions);
      return item;
    }));
    savedAddresses.hidden = addresses.length === 0;
    continueLink.hidden = addresses.length === 0;
  };
  const refreshAddresses = async () => {
    const result = await requestAddressApi("/addresses");
    addresses = result.addresses || [];
    renderAddresses();
  };
  const beginEdit = (address) => {
    editingId = address.id;
    for (const key of ["title", "recipientName", "phone", "city", "district", "postalCode", "addressLine"]) form.elements[key].value = address[key] || "";
    form.elements.isDefault.checked = address.isDefault;
    document.querySelector("#address-form-title").textContent = "Adresi düzenle";
    document.querySelector("#address-submit-label").textContent = "Değişiklikleri kaydet";
    cancelEdit.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const resetEdit = () => {
    editingId = null; form.reset();
    document.querySelector("#address-form-title").textContent = "Yeni adres ekle";
    document.querySelector("#address-submit-label").textContent = "Adresi kaydet";
    cancelEdit.hidden = true;
    form.elements.isDefault.checked = addresses.length === 0;
  };
  const toggleDefault = async (address) => {
    try {
      const updated = await requestAddressApi(`/addresses/${address.id}`, { method: "PUT", body: JSON.stringify({ ...address, isDefault: !address.isDefault }) });
      addresses = addresses.map((saved) => saved.id === address.id ? updated.address : { ...saved, isDefault: updated.address.isDefault ? false : saved.isDefault });
      renderAddresses(); showFeedback(updated.address.isDefault ? "Varsayılan adresin güncellendi." : "Adres artık varsayılan değil.", "success");
    } catch (error) { showFeedback(error.message, "error"); }
  };
  const deleteAddress = async (address) => {
    if (!window.confirm(`“${address.title}” adresini silmek istiyor musun?`)) return;
    try { await requestAddressApi(`/addresses/${address.id}`, { method: "DELETE" }); addresses = addresses.filter((saved) => saved.id !== address.id); renderAddresses(); showFeedback("Adres silindi.", "success"); }
    catch (error) { showFeedback(error.message, "error"); }
  };

  const user = await (window.MODA_AUTH_READY || Promise.resolve(null));
  if (!user) { window.location.assign("./giris.html?next=adres.html"); return; }
  try {
    const cart = await requestAddressApi("/cart");
    const items = Array.isArray(cart.items) ? cart.items : [];
    orderItems.replaceChildren(...(items.length ? items.map((item) => {
      const row = document.createElement("li"); const details = document.createElement("span");
      details.textContent = `${item.name} · ${item.size} (${item.quantity} adet)`;
      const amount = document.createElement("span"); amount.textContent = window.MODA_I18N?.money(item.lineTotal) || `${item.lineTotal} ₺`;
      row.append(details, amount); return row;
    }) : [Object.assign(document.createElement("li"), { textContent: "Sepetinde henüz ürün yok." })]));
    orderTotal.textContent = window.MODA_I18N?.money(cart.total) || `${cart.total || 0} ₺`;
    if (!user.emailVerified) {
      form.hidden = true; document.querySelector("#email-verification-required").hidden = false;
      document.querySelector("#address-form-title").textContent = "E-posta doğrulaması gerekli"; return;
    }
    await refreshAddresses();
    form.elements.isDefault.checked = addresses.length === 0;
  } catch (error) {
    if (error.status === 401) { window.location.assign("./giris.html?next=adres.html"); return; }
    showFeedback(error.message || "Adres bilgileri yüklenemedi.", "error");
    orderItems.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Sepet özeti şu anda yüklenemedi." }));
  }

  cancelEdit.addEventListener("click", resetEdit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const formData = new FormData(form); const payload = Object.fromEntries(formData); payload.isDefault = form.elements.isDefault.checked;
    submit.disabled = true; showFeedback("Adres kaydediliyor…", "loading");
    try {
      const result = await requestAddressApi(editingId ? `/addresses/${editingId}` : "/addresses", { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
      if (editingId) addresses = addresses.map((address) => address.id === editingId ? result.address : { ...address, isDefault: result.address.isDefault ? false : address.isDefault });
      else { if (result.address.isDefault) addresses = addresses.map((address) => ({ ...address, isDefault: false })); addresses.unshift(result.address); }
      renderAddresses(); resetEdit(); showFeedback("Adresin hesabına kaydedildi ♥", "success");
      sessionStorage.setItem("modaSelectedAddressId", String(result.address.id));
    } catch (error) {
      if (error.status === 401) { window.location.assign("./giris.html?next=adres.html"); return; }
      showFeedback(error.message || "Adres kaydedilemedi. Lütfen tekrar dene.", "error");
    } finally { submit.disabled = false; }
  });
  continueLink.addEventListener("click", (event) => {
    const selected = addresses.find((address) => String(address.id) === sessionStorage.getItem("modaSelectedAddressId")) || addresses.find((address) => address.isDefault) || addresses[0];
    if (!selected) { event.preventDefault(); showFeedback("Ödemeye geçmek için önce bir adres eklemelisin.", "error"); return; }
    sessionStorage.setItem("modaSelectedAddressId", String(selected.id));
  });
});
