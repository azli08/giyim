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

const countryCities = {
  TR: ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis", "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Şanlıurfa", "Siirt", "Sinop", "Sivas", "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"],
  SY: ["Şam", "Halep", "Şam Kırsalı", "Humus", "Hama", "Lazkiye", "İdlib", "Tartus", "Rakka", "Deyrizor", "Haseke", "Dera", "Süveyda", "Kuneytra"],
};

const createAddressDropdown = (select, index) => {
  const label = select.closest(".address-field")?.querySelector("span")?.textContent || "";
  const picker = document.createElement("div");
  picker.className = "address-cute-select";
  const trigger = document.createElement("button");
  trigger.className = "address-cute-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "address-cute-menu";
  menu.id = `address-options-${index}`;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);
  const sync = () => {
    const selected = select.options[select.selectedIndex];
    trigger.textContent = selected?.textContent || "";
    trigger.disabled = select.disabled;
    trigger.setAttribute("aria-label", `${label}: ${selected?.textContent || ""}`);
    [...menu.querySelectorAll("[role=option]")].forEach((option) => {
      const chosen = option.dataset.value === select.value;
      option.setAttribute("aria-selected", String(chosen));
      option.classList.toggle("is-selected", chosen);
    });
  };
  const rebuild = () => {
    menu.replaceChildren();
    [...select.options].filter((nativeOption) => nativeOption.value && !nativeOption.disabled).forEach((nativeOption) => {
      const option = document.createElement("button");
      option.className = "address-cute-option";
      option.type = "button";
      option.setAttribute("role", "option");
      option.dataset.value = nativeOption.value;
      option.textContent = nativeOption.textContent;
      option.addEventListener("click", () => {
        select.value = nativeOption.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      });
      menu.append(option);
    });
    sync();
  };
  const toggle = (open) => {
    if (trigger.disabled) return;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) ([...menu.querySelectorAll("[role=option]")].find((option) => option.dataset.value === select.value) || menu.querySelector("[role=option]"))?.focus();
  };
  trigger.addEventListener("click", () => toggle(menu.hidden));
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "Enter", " "].includes(event.key)) { event.preventDefault(); toggle(true); }
  });
  menu.addEventListener("keydown", (event) => {
    const options = [...menu.querySelectorAll("[role=option]")];
    const activeIndex = options.indexOf(document.activeElement);
    if (event.key === "Escape") { event.preventDefault(); toggle(false); trigger.focus(); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (activeIndex + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
      options[nextIndex]?.focus();
    }
  });
  document.addEventListener("click", (event) => { if (!picker.contains(event.target)) toggle(false); });
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  select.after(picker);
  picker.append(trigger, menu);
  select.addEventListener("change", sync);
  document.addEventListener("modachange", sync);
  rebuild();
  return { rebuild, sync };
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
  const countrySelect = form.elements.countryCode;
  const citySelect = form.elements.city;
  const countryDropdown = createAddressDropdown(countrySelect, 0);
  const cityDropdown = createAddressDropdown(citySelect, 1);
  const phoneInput = form.elements.phone;
  const postalCodeInput = form.elements.postalCode;
  const continueLink = document.querySelector("#continue-to-payment");
  const cancelEdit = document.querySelector("#cancel-address-edit");
  const deleteAddressDialog = document.querySelector("#delete-address-dialog");
  const deleteAddressName = deleteAddressDialog.querySelector(".address-confirm-name");
  const t = (message) => window.MODA_I18N?.t(message) || message;
  let addresses = [];
  let cartData = { items: [], total: 0 };

  const populateCities = (countryCode, selectedCity = "") => {
    const cities = countryCities[countryCode] || [];
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = countryCode ? "Şehir seçin" : "Önce ülke seçin";
    citySelect.replaceChildren(placeholder, ...cities.map((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      return option;
    }));
    citySelect.disabled = cities.length === 0;
    citySelect.value = cities.includes(selectedCity) ? selectedCity : "";
    cityDropdown.rebuild();
  };
  countrySelect.addEventListener("change", () => populateCities(countrySelect.value));
  populateCities(countrySelect.value);

  postalCodeInput.addEventListener("input", () => {
    postalCodeInput.value = postalCodeInput.value.slice(0, 20);
  });

  phoneInput.addEventListener("input", () => {
    let cleaned = phoneInput.value.replace(/[^+()\d\s.-]/g, "").slice(0, 24);
    const digits = cleaned.match(/\d/g) || [];
    if (digits.length > 15) {
      let keptDigits = 0;
      cleaned = cleaned.replace(/\d/g, (digit) => (++keptDigits <= 15 ? digit : ""));
    }
    if (phoneInput.value !== cleaned) phoneInput.value = cleaned;
    const normalizedDigits = (cleaned.match(/\d/g) || []).join("");
    const validInternationalNumber = normalizedDigits.length >= 7 && normalizedDigits.length <= 15;
    phoneInput.setCustomValidity(cleaned && !validInternationalNumber
      ? "Telefon numarası 7 ile 15 rakam arasında olmalı."
      : "");
  });
  let editingId = null;

  const showFeedback = (message, state = "") => { feedback.dataset.sourceMessage = message; feedback.textContent = t(message); feedback.dataset.state = state; };
  const renderAddresses = () => {
    savedAddressList.replaceChildren(...addresses.map((address) => {
      const item = document.createElement("li");
      const heading = document.createElement("strong");
      heading.textContent = address.title;
      if (address.isDefault) {
        const badge = document.createElement("span");
        badge.className = "address-default-badge";
        badge.textContent = t("Varsayılan");
        heading.append(" · ", badge);
      }
      const details = document.createElement("p");
      details.textContent = `${address.recipientName} · ${address.phone} · ${address.addressLine}, ${address.district}, ${t(address.city)}${address.country ? `, ${t(address.country)}` : ""}${address.postalCode ? ` ${address.postalCode}` : ""}`;
      const actions = document.createElement("div"); actions.className = "saved-address-actions";
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = t("Düzenle");
      edit.addEventListener("click", () => beginEdit(address));
      const defaultButton = document.createElement("button"); defaultButton.type = "button";
      defaultButton.textContent = t(address.isDefault ? "Varsayılanı kaldır" : "Varsayılan yap");
      defaultButton.addEventListener("click", () => toggleDefault(address));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = t("Sil"); remove.className = "is-danger";
      remove.addEventListener("click", () => deleteAddress(address));
      actions.append(edit, defaultButton, remove);
      item.append(heading, details, actions);
      return item;
    }));
    savedAddresses.hidden = addresses.length === 0;
    continueLink.hidden = addresses.length === 0;
  };
  const renderOrderSummary = () => {
    const items = Array.isArray(cartData.items) ? cartData.items : [];
    orderItems.replaceChildren(...(items.length ? items.map((item) => {
      const row = document.createElement("li");
      const details = document.createElement("span");
      details.textContent = `${t(item.name)} · ${item.size} (${item.quantity} ${t("adet")})`;
      const amount = document.createElement("span");
      amount.textContent = window.MODA_I18N?.money(item.lineTotal) || `${item.lineTotal} ₺`;
      row.append(details, amount);
      return row;
    }) : [Object.assign(document.createElement("li"), { textContent: t("Sepetinde henüz ürün yok.") })]));
    orderTotal.textContent = window.MODA_I18N?.money(cartData.total) || `${cartData.total || 0} ₺`;
  };
  document.addEventListener("modachange", () => {
    renderAddresses();
    renderOrderSummary();
    if (feedback.dataset.sourceMessage) feedback.textContent = t(feedback.dataset.sourceMessage);
    if (!form.hidden) {
      document.querySelector("#address-form-title").textContent = t(editingId ? "Adresi düzenle" : "Yeni adres ekle");
      document.querySelector("#address-submit-label").textContent = t(editingId ? "Değişiklikleri kaydet" : "Adresi kaydet");
      cancelEdit.textContent = t("Düzenlemeyi iptal et");
    }
  });
  const refreshAddresses = async () => {
    const result = await requestAddressApi("/addresses");
    addresses = result.addresses || [];
    renderAddresses();
  };
  const beginEdit = (address) => {
    editingId = address.id;
    for (const key of ["title", "recipientName", "phone", "district", "postalCode", "addressLine"]) form.elements[key].value = address[key] || "";
    countrySelect.value = address.countryCode || "TR";
    populateCities(countrySelect.value, address.city || "");
    countryDropdown.sync();
    form.elements.isDefault.checked = address.isDefault;
    document.querySelector("#address-form-title").textContent = t("Adresi düzenle");
    document.querySelector("#address-submit-label").textContent = t("Değişiklikleri kaydet");
    cancelEdit.hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const resetEdit = () => {
    editingId = null; form.reset();
    countrySelect.value = "";
    populateCities("");
    countryDropdown.sync();
    document.querySelector("#address-form-title").textContent = t("Yeni adres ekle");
    document.querySelector("#address-submit-label").textContent = t("Adresi kaydet");
    cancelEdit.textContent = t("Düzenlemeyi iptal et");
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
    deleteAddressName.textContent = address.title;
    const confirmation = await new Promise((resolve) => {
      deleteAddressDialog.addEventListener("close", () => resolve(deleteAddressDialog.returnValue), { once: true });
      deleteAddressDialog.showModal();
    });
    if (confirmation !== "delete") return;
    try { await requestAddressApi(`/addresses/${address.id}`, { method: "DELETE" }); addresses = addresses.filter((saved) => saved.id !== address.id); renderAddresses(); showFeedback("Adres silindi.", "success"); }
    catch (error) { showFeedback(error.message, "error"); }
  };

  const user = await (window.MODA_AUTH_READY || Promise.resolve(null));
  if (!user) { window.location.assign("./giris.html?next=adres.html"); return; }
  try {
    cartData = await requestAddressApi("/cart");
    renderOrderSummary();
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
