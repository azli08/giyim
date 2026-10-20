const adminPageHost = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.hostname
  : "localhost";
const adminApiBaseUrl = (window.MODA_API_URL || `http://${adminPageHost}:3000/api`).replace(/\/$/, "");
const adminLoginView = document.querySelector("#admin-login-view");
const adminDashboard = document.querySelector("#admin-dashboard");
const adminLoginForm = document.querySelector("#admin-login-form");
const adminLoginFeedback = document.querySelector("#admin-login-feedback");
const adminProductForm = document.querySelector("#admin-product-form");
const adminProductFeedback = document.querySelector("#admin-product-feedback");
const adminProductList = document.querySelector("#admin-product-list");
const adminCategorySelect = document.querySelector("#admin-category");
const adminCancelEdit = document.querySelector("#admin-cancel-edit");
let editingProductId = null;

async function adminRequest(path, options = {}) {
  const response = await fetch(`${adminApiBaseUrl}${path}`, {
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
    // API JSON döndürmediğinde HTTP durum koduna göre hata göster.
  }

  if (!response.ok) {
    const error = new Error(data.error || "İşlem tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function setAdminFeedback(element, message, state = "") {
  element.textContent = message;
  element.dataset.state = state;
}

function showDashboard(user) {
  adminLoginView.hidden = true;
  adminDashboard.hidden = false;
  document.querySelector("#admin-greeting").textContent = `${user.firstName} ${user.lastName} olarak giriş yaptın.`;
}

function updateVariantRows() {
  const rows = [...document.querySelectorAll(".admin-variant-form-row")];
  rows.forEach((row, index) => {
    row.querySelector("legend").textContent = `Varyant ${index + 1}`;
    row.querySelector(".admin-remove-variant").hidden = rows.length === 1;
  });
}

function addVariantRow(variant = null) {
  const row = document.createElement("fieldset");
  row.className = "admin-variant-form-row";
  if (variant?.id) row.dataset.variantId = variant.id;
  row.innerHTML = `
    <legend></legend>
    <label>SKU<input data-field="sku" required minlength="2" maxlength="80" pattern="[A-Za-z0-9._-]+" placeholder="MINIK-KASIF-67"></label>
    <label>Beden<input data-field="size" required maxlength="40" placeholder="6-7"></label>
    <label>Renk<input data-field="color" required maxlength="80" placeholder="Pembe"></label>
    <label>Fiyat (₺)<input data-field="price" type="number" min="0" step="0.01" required placeholder="549.90"></label>
    <label>Stok<input data-field="stockQuantity" type="number" min="0" max="2147483647" step="1" required value="0"></label>
    <button class="admin-remove-variant" type="button" aria-label="Bu varyantı kaldır">×</button>
  `;
  row.querySelector(".admin-remove-variant").addEventListener("click", () => {
    row.remove();
    updateVariantRows();
  });
  if (variant) {
    for (const field of ["sku", "size", "color", "price", "stockQuantity"]) {
      row.querySelector(`[data-field='${field}']`).value = variant[field];
    }
  }
  document.querySelector("#admin-variant-form-list").append(row);
  updateVariantRows();
}

async function openAdminDashboard(user) {
  showDashboard(user);
  try {
    await loadCategories();
  } catch (error) {
    setAdminFeedback(adminProductFeedback, error.message, "error");
  }
  await loadProducts();
}

async function loadCategories() {
  const { categories } = await adminRequest("/admin/categories");
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    adminCategorySelect.append(option);
  }
}

function createVariantRow(product, variant) {
  const row = document.createElement("form");
  row.className = "admin-variant-row";

  const details = document.createElement("span");
  details.textContent = `${variant.size} · ${variant.color} · ₺${Number(variant.price).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`;

  const stockInput = document.createElement("input");
  stockInput.className = "admin-stock-input";
  stockInput.type = "number";
  stockInput.min = "0";
  stockInput.step = "1";
  stockInput.value = variant.stockQuantity;
  stockInput.setAttribute("aria-label", `${product.name}, ${variant.size} stok miktarı`);
  stockInput.required = true;

  const saveButton = document.createElement("button");
  saveButton.className = "admin-stock-save";
  saveButton.type = "submit";
  saveButton.textContent = "Kaydet";

  row.append(details, stockInput, saveButton);
  row.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!row.reportValidity()) return;
    saveButton.disabled = true;
    try {
      await adminRequest(`/admin/variants/${encodeURIComponent(variant.sku)}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stockQuantity: Number(stockInput.value) }),
      });
      saveButton.textContent = "Kaydedildi ✓";
      window.setTimeout(() => { saveButton.textContent = "Kaydet"; }, 1200);
    } catch (error) {
      saveButton.textContent = error.message;
      window.setTimeout(() => { saveButton.textContent = "Kaydet"; }, 2200);
    } finally {
      saveButton.disabled = false;
    }
  });
  return row;
}

function startProductEdit(product) {
  editingProductId = product.id;
  adminProductForm.elements.name.value = product.name;
  adminProductForm.elements.slug.value = product.slug;
  adminProductForm.elements.slug.dataset.edited = "true";
  adminProductForm.elements.categoryId.value = product.category_id || "";
  adminProductForm.elements.description.value = product.description || "";
  adminProductForm.elements.imageUrl.value = product.image?.url || "";
  adminProductForm.elements.imageAlt.value = product.image?.alt || "";
  adminProductForm.elements.isActive.checked = product.is_active;

  document.querySelector("#admin-variant-form-list").replaceChildren();
  for (const variant of product.variants) addVariantRow(variant);
  if (product.variants.length === 0) addVariantRow();

  adminProductForm.querySelector("button[type='submit']").textContent = "Değişiklikleri kaydet";
  adminCancelEdit.hidden = false;
  setAdminFeedback(adminProductFeedback, `${product.name} düzenleniyor.`);
  adminProductForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  editingProductId = null;
  adminProductForm.reset();
  adminProductForm.elements.slug.dataset.edited = "";
  const rows = [...document.querySelectorAll(".admin-variant-form-row")];
  rows.slice(1).forEach((row) => row.remove());
  const firstRow = rows[0];
  if (firstRow) {
    delete firstRow.dataset.variantId;
    firstRow.querySelectorAll("[data-field]").forEach((input) => {
      input.value = input.dataset.field === "stockQuantity" ? "0" : "";
    });
  } else {
    addVariantRow();
  }
  updateVariantRows();
  adminProductForm.querySelector("button[type='submit']").textContent = "Ürünü kaydet";
  adminCancelEdit.hidden = true;
  setAdminFeedback(adminProductFeedback, "");
}

function createProductEntry(product) {
  const entry = document.createElement("article");
  entry.className = "admin-product-entry";

  const summary = document.createElement("div");
  summary.className = "admin-product-summary";
  if (product.image?.url) {
    const image = document.createElement("img");
    image.src = product.image.url;
    image.alt = product.image.alt || product.name;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      const placeholder = document.createElement("span");
      placeholder.className = "admin-product-placeholder";
      placeholder.textContent = "♥";
      image.replaceWith(placeholder);
    }, { once: true });
    summary.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "admin-product-placeholder";
    placeholder.textContent = "♥";
    summary.append(placeholder);
  }

  const info = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = product.name;
  const slug = document.createElement("p");
  slug.textContent = `${product.category || "Kategorisiz"} · ${product.slug}`;
  info.append(title, slug);

  const status = document.createElement("span");
  status.className = `admin-status${product.is_active ? "" : " is-inactive"}`;
  status.textContent = product.is_active ? "Yayında" : "Pasif";
  summary.append(info, status);
  entry.append(summary);

  const actions = document.createElement("div");
  actions.className = "admin-product-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "Ürünü düzenle";
  editButton.addEventListener("click", () => startProductEdit(product));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "admin-delete-product";
  deleteButton.textContent = "Ürünü sil";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`“${product.name}” ürününü ve varyantlarını silmek istediğine emin misin?`)) return;
    deleteButton.disabled = true;
    try {
      await adminRequest(`/admin/products/${product.id}`, { method: "DELETE" });
      if (editingProductId === product.id) resetProductForm();
      await loadProducts();
    } catch (error) {
      window.alert(error.message);
      deleteButton.disabled = false;
    }
  });
  actions.append(editButton, deleteButton);
  entry.append(actions);

  const variants = document.createElement("div");
  variants.className = "admin-variant-list";
  if (!product.variants.length) {
    const empty = document.createElement("p");
    empty.className = "admin-list-hint";
    empty.textContent = "Aktif varyant yok.";
    variants.append(empty);
  } else {
    for (const variant of product.variants) variants.append(createVariantRow(product, variant));
  }
  entry.append(variants);
  return entry;
}

async function loadProducts() {
  adminProductList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "admin-empty";
  loading.textContent = "Ürünler yükleniyor…";
  adminProductList.append(loading);

  try {
    const { products } = await adminRequest("/admin/products");
    adminProductList.replaceChildren();
    if (products.length === 0) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "Henüz ürün yok. Soldaki formdan ilk ürünü ekleyebilirsin.";
      adminProductList.append(empty);
      return;
    }
    for (const product of products) adminProductList.append(createProductEntry(product));
  } catch (error) {
    loading.textContent = error.message;
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminLoginForm.reportValidity()) return;

  const submit = adminLoginForm.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(adminLoginForm));
  submit.disabled = true;
  setAdminFeedback(adminLoginFeedback, "Giriş yapılıyor…");
  try {
    const { user } = await adminRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(values),
    });
    if (!user?.isAdmin) {
      await adminRequest("/auth/logout", { method: "POST", body: "{}" });
      throw new Error("Bu hesap yönetici yetkisine sahip değil.");
    }
    await openAdminDashboard(user);
  } catch (error) {
    setAdminFeedback(adminLoginFeedback, error.message || "Sunucuya ulaşılamadı.", "error");
  } finally {
    submit.disabled = false;
  }
});

adminProductForm.elements.name.addEventListener("input", (event) => {
  const slugInput = adminProductForm.elements.slug;
  if (slugInput.dataset.edited === "true") return;
  slugInput.value = event.target.value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
});
adminProductForm.elements.slug.addEventListener("input", () => {
  adminProductForm.elements.slug.dataset.edited = "true";
});

adminProductForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminProductForm.reportValidity()) return;
  const submit = adminProductForm.querySelector("button[type='submit']");
  const values = Object.fromEntries(new FormData(adminProductForm));
  const variants = [...document.querySelectorAll(".admin-variant-form-row")].map((row) => ({
    ...(row.dataset.variantId ? { id: Number(row.dataset.variantId) } : {}),
    sku: row.querySelector("[data-field='sku']").value,
    size: row.querySelector("[data-field='size']").value,
    color: row.querySelector("[data-field='color']").value,
    price: row.querySelector("[data-field='price']").value,
    stockQuantity: Number(row.querySelector("[data-field='stockQuantity']").value),
  }));
  const payload = {
    ...values,
    categoryId: Number(values.categoryId),
    isActive: adminProductForm.elements.isActive.checked,
    variants,
  };
  submit.disabled = true;
  setAdminFeedback(adminProductFeedback, editingProductId ? "Ürün güncelleniyor…" : "Ürün ve varyantları kaydediliyor…");
  try {
    await adminRequest(editingProductId ? `/admin/products/${editingProductId}` : "/admin/products", {
      method: editingProductId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    const successMessage = editingProductId ? "Ürün bilgileri güncellendi." : "Ürün mağaza kataloğuna eklendi.";
    resetProductForm();
    setAdminFeedback(adminProductFeedback, successMessage, "success");
    await loadProducts();
  } catch (error) {
    setAdminFeedback(adminProductFeedback, error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#admin-refresh").addEventListener("click", loadProducts);
document.querySelector("#admin-add-variant").addEventListener("click", () => addVariantRow());
adminCancelEdit.addEventListener("click", resetProductForm);
document.querySelector("#admin-logout").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    await adminRequest("/auth/logout", { method: "POST", body: "{}" });
  } finally {
    window.location.reload();
  }
});

adminRequest("/admin/me")
  .then(({ user }) => openAdminDashboard(user))
  .catch(() => {
    adminLoginView.hidden = false;
    adminDashboard.hidden = true;
  });
