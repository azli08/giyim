const storefrontLocalApiHost = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.hostname
  : "localhost";
const apiBaseUrl = (window.MODA_API_URL || `http://${storefrontLocalApiHost}:3000/api`).replace(/\/$/, "");

const requestStorefrontApi = async (path, options = {}, fallbackMessage = "İstek tamamlanamadı.") => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: options.body
      ? { "Content-Type": "application/json", ...options.headers }
      : options.headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || fallbackMessage);
    error.status = response.status;
    throw error;
  }

  return data;
};

const createProductCard = (product) => {
  const card = document.createElement("article");
  card.className = "product-card";
  card.dataset.productId = product.id;
  card.dataset.productSlug = product.slug;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const availablePrices = variants.map((variant) => Number(variant.price)).filter(Number.isFinite);
  card.dataset.price = String(availablePrices.length ? Math.min(...availablePrices) : 0);

  const image = document.createElement("img");
  image.src = product.image?.url || "./images/children.jpg";
  image.alt = product.image?.alt || product.name;
  image.loading = "lazy";

  const info = document.createElement("div");
  info.className = "product-info";
  const category = document.createElement("p");
  category.className = "product-category";
  category.textContent = product.category || "MODA";
  const title = document.createElement("h3");
  title.textContent = product.name;
  const price = document.createElement("p");
  price.className = "product-price";
  price.textContent = availablePrices.length
    ? new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
    }).format(Math.min(...availablePrices))
    : "Stokta yok";
  const sizeLabel = document.createElement("p");
  sizeLabel.className = "size-label";
  sizeLabel.textContent = "Beden (yaş)";
  const sizeList = document.createElement("ul");
  sizeList.className = "size-list";
  sizeList.setAttribute("aria-label", "Beden seçin");

  variants.forEach((variant) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = variant.size;
    button.dataset.variantId = variant.id;
    button.dataset.price = variant.price;
    button.dataset.stock = variant.stockQuantity;
    button.setAttribute("aria-pressed", "false");
    button.disabled = Number(variant.stockQuantity) <= 0;
    if (button.disabled) button.setAttribute("aria-label", `${variant.size} yaş bedeni stokta yok`);
    item.append(button);
    sizeList.append(item);
  });

  const addButton = document.createElement("button");
  addButton.className = "add-to-cart";
  addButton.type = "button";
  addButton.textContent = "Sepete Ekle";

  info.append(category, title, price, sizeLabel, sizeList, addButton);
  card.append(image, info);
  return card;
};

const loadCatalog = async () => {
  const category = document.body.dataset.catalogCategory || "all";
  const url = category === "all"
    ? `${apiBaseUrl}/products`
    : `${apiBaseUrl}/products?category=${encodeURIComponent(category)}`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Katalog isteği başarısız: ${response.status}`);
    const products = await response.json();
    if (!Array.isArray(products) || products.length === 0) return;

    const grid = document.querySelector(".product-grid");
    if (!grid) return;
    const shownProducts = category === "all" ? products.slice(0, 3) : products;
    grid.replaceChildren(...shownProducts.map(createProductCard));
  } catch (error) {
    console.info("Backend kataloğu kullanılamadı; sayfadaki örnek ürünler gösteriliyor.", error);
  } finally {
    window.clearTimeout(timeout);
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadCatalog();
  const navLinks = document.querySelectorAll(".site-header nav .nav-link");
  const currentFile = window.location.pathname.split("/").pop() || "index.html";

  navLinks.forEach((link) => {
    const linkUrl = new URL(link.href, window.location.href);
    const linkFile = linkUrl.pathname.split("/").pop() || "index.html";
    const isCurrentPage = linkFile === currentFile;

    link.classList.toggle("active", isCurrentPage);
    if (isCurrentPage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }

    link.addEventListener("click", (event) => {
      const goesToAnotherPage = linkUrl.origin === window.location.origin
        && linkUrl.pathname !== window.location.pathname;

      if (!goesToAnotherPage || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      document.body.classList.add("page-leaving");
      window.setTimeout(() => {
        window.location.href = link.href;
      }, 140);
    });
  });

  document.querySelectorAll(".footer-links a").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      const heart = document.createElement("span");
      heart.className = "footer-heart-pop";
      heart.setAttribute("aria-hidden", "true");
      heart.textContent = "♥";
      link.append(heart);
      window.setTimeout(() => heart.remove(), 600);

      const samePage = destination.pathname === window.location.pathname;
      if (samePage && destination.hash) {
        window.setTimeout(() => {
          history.pushState(null, "", destination.hash);
          document.querySelector(destination.hash)?.scrollIntoView({ behavior: "smooth" });
        }, 180);
        return;
      }

      window.setTimeout(() => {
        document.body.classList.add("page-leaving");
        window.setTimeout(() => {
          window.location.href = link.href;
        }, 140);
      }, 180);
    });
  });

  const hearts = document.querySelectorAll(".side-heart, .photo-heart");

  hearts.forEach((heart, index) => {
    heart.style.animationDelay = `${index * 0.35}s`;
  });

  const cards = document.querySelectorAll(".product-card");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let favorites = [];
  const currentUser = await (window.MODA_AUTH_READY || Promise.resolve(null));

  const loadFavorites = async () => {
    if (!currentUser) return;

    try {
      const result = await requestStorefrontApi("/favorites", {}, "Favoriler yüklenemedi.");
      favorites = Array.isArray(result.favorites) ? result.favorites : [];
    } catch (error) {
      if (error.status === 401) {
        window.location.assign("./giris.html");
        return;
      }
      console.error("Favoriler yüklenemedi:", error);
    }
  };

  const getFavoriteSlug = (card) => card.dataset.productSlug || "";
  const isFavoriteSlug = (productSlug) =>
    favorites.some((favorite) => favorite.productSlug === productSlug);

  const syncFavoriteButtons = () => {
    cards.forEach((card) => {
      const productSlug = getFavoriteSlug(card);
      const isFavorite = isFavoriteSlug(productSlug);
      const button = card.querySelector(".favorite-toggle");
      if (!button) return;

      button.setAttribute("aria-pressed", String(isFavorite));
      button.setAttribute("aria-label", isFavorite ? "Favorilerden çıkar" : "Favorilere ekle");
      button.classList.toggle("is-favorite", isFavorite);
      button.firstElementChild.textContent = isFavorite ? "♥" : "♡";
    });
  };

  const favoriteButton = document.createElement("button");
  favoriteButton.className = "favorites-toggle";
  favoriteButton.type = "button";
  favoriteButton.setAttribute("aria-expanded", "false");
  favoriteButton.setAttribute("aria-controls", "favorites-panel");
  favoriteButton.innerHTML = `
    <i aria-hidden="true">♥</i>
    <span>Favoriler</span>
    <span class="favorites-count" aria-label="Favori sayısı">0</span>
  `;

  const favoritesPanel = document.createElement("div");
  favoritesPanel.className = "favorites-panel";
  favoritesPanel.id = "favorites-panel";
  favoritesPanel.hidden = true;
  favoritesPanel.innerHTML = `
    <h2>Favorilerim</h2>
    <ul class="favorites-list"></ul>
    <p class="favorites-empty">Henüz favori ürünün yok.</p>
  `;

  const favoritesArea = document.createElement("div");
  favoritesArea.className = "favorites-area";
  favoritesArea.append(favoriteButton, favoritesPanel);
  document.querySelector(".cart-area")?.before(favoritesArea);

  const renderFavorites = () => {
    const favoritesList = favoritesPanel.querySelector(".favorites-list");
    favoritesList.replaceChildren();

    favorites.forEach((favorite) => {
      const row = document.createElement("li");
      row.className = "favorite-item";
      const image = document.createElement("img");
      image.src = favorite.image;
      image.alt = favorite.imageAlt || "";
      const info = document.createElement("span");
      info.className = "favorite-item-info";
      const name = document.createElement("strong");
      name.textContent = favorite.name;
      const price = document.createElement("small");
      price.textContent = new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
      }).format(Number(favorite.price) || 0);
      info.append(name, price);
      const remove = document.createElement("button");
      remove.className = "favorite-remove";
      remove.type = "button";
      remove.dataset.favoriteSlug = favorite.productSlug;
      remove.setAttribute("aria-label", `${favorite.name} ürününü favorilerden çıkar`);
      remove.textContent = "×";
      row.append(image, info, remove);
      favoritesList.append(row);
    });

    favoriteButton.querySelector(".favorites-count").textContent = String(favorites.length);
    favoritesPanel.querySelector(".favorites-empty").hidden = favorites.length > 0;
    favoritesList.hidden = favorites.length === 0;
    syncFavoriteButtons();
  };

  const changeFavorite = async (productSlug, shouldBeFavorite) => {
    if (!currentUser) {
      window.location.assign("./giris.html");
      return;
    }
    if (!productSlug) {
      showToast("Favorilere eklemek için ürün kataloğunun yüklenmesi gerekiyor.");
      return;
    }

    const path = shouldBeFavorite
      ? "/favorites"
      : `/favorites/${encodeURIComponent(productSlug)}`;
    const options = shouldBeFavorite
      ? { method: "POST", body: JSON.stringify({ productSlug }) }
      : { method: "DELETE" };

    try {
      const result = await requestStorefrontApi(path, options, "Favori işlemi tamamlanamadı.");
      favorites = Array.isArray(result.favorites) ? result.favorites : [];
      renderFavorites();
      showToast(shouldBeFavorite ? "Favorilere eklendi ♥" : "Favorilerden çıkarıldı.");
    } catch (error) {
      if (error.status === 401) {
        window.location.assign("./giris.html");
        return;
      }
      if (error.status === 404 && error.message === "Bulunamadı") {
        showToast("Favori servisi güncel değil. Backend'i yeniden başlatıp tekrar dene.");
        return;
      }
      showToast(error.message || "Favori işlemi tamamlanamadı.");
    }
  };

  favoriteButton.addEventListener("click", () => {
    if (!currentUser) {
      window.location.assign("./giris.html");
      return;
    }

    const open = favoritesPanel.hidden;
    favoritesPanel.hidden = !open;
    favoriteButton.setAttribute("aria-expanded", String(open));
    if (open) {
      cartPanel.hidden = true;
      cartToggle.setAttribute("aria-expanded", "false");
    }
  });

  favoritesPanel.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-favorite-slug]");
    if (!removeButton) return;
    void changeFavorite(removeButton.dataset.favoriteSlug, false);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".favorites-area")) {
      favoritesPanel.hidden = true;
      favoriteButton.setAttribute("aria-expanded", "false");
    }
  });

  const showToast = (message) => {
    cartToast.textContent = message;
    cartToast.classList.add("is-shown");
    window.setTimeout(() => cartToast.classList.remove("is-shown"), 2200);
  };

  if (reducedMotion || !("IntersectionObserver" in window)) {
    cards.forEach((card) => card.classList.add("is-visible"));
  } else {
    const cardObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    cards.forEach((card, index) => {
      card.style.transitionDelay = `${index * 120}ms`;
      cardObserver.observe(card);
    });
  }

  const productDialog = document.createElement("dialog");
  productDialog.className = "product-dialog";
  productDialog.setAttribute("aria-labelledby", "product-dialog-title");
  productDialog.innerHTML = `
    <div class="product-dialog-content">
      <button class="product-dialog-close" type="button" aria-label="Pencereyi kapat">×</button>
      <img class="product-dialog-image" alt="">
      <div class="product-dialog-info">
        <p class="product-category"></p>
        <h2 id="product-dialog-title"></h2>
        <div class="product-dialog-price"></div>
        <p class="size-label">Beden (yaş)</p>
        <div class="product-dialog-sizes" role="group" aria-label="Beden seçin"></div>
        <button class="add-to-cart product-dialog-add" type="button" disabled>Sepete Ekle</button>
      </div>
    </div>
  `;
  document.body.append(productDialog);

  const dialogImage = productDialog.querySelector(".product-dialog-image");
  const dialogCategory = productDialog.querySelector(".product-category");
  const dialogTitle = productDialog.querySelector("#product-dialog-title");
  const dialogPrice = productDialog.querySelector(".product-dialog-price");
  const dialogSizes = productDialog.querySelector(".product-dialog-sizes");
  const dialogAddButton = productDialog.querySelector(".product-dialog-add");
  let activeProductCard = null;
  let activeProductSize = null;

  cards.forEach((card) => {
    const favoriteSlug = getFavoriteSlug(card);
    const favoriteButton = document.createElement("button");
    favoriteButton.className = "favorite-toggle";
    favoriteButton.type = "button";
    favoriteButton.setAttribute("aria-pressed", String(isFavoriteSlug(favoriteSlug)));
    const favoriteLabel = isFavoriteSlug(favoriteSlug)
      ? "Favorilerden çıkar"
      : "Favorilere ekle";
    favoriteButton.setAttribute("aria-label", favoriteLabel);
    favoriteButton.innerHTML = '<span aria-hidden="true">♡</span>';
    if (isFavoriteSlug(favoriteSlug)) {
      favoriteButton.classList.add("is-favorite");
      favoriteButton.firstElementChild.textContent = "♥";
    }
    card.append(favoriteButton);

    favoriteButton.addEventListener("click", () => {
      const isFavorite = favoriteButton.getAttribute("aria-pressed") === "true";
      void changeFavorite(favoriteSlug, !isFavorite);
    });

    const detailsButton = document.createElement("button");
    detailsButton.className = "product-details-button";
    detailsButton.type = "button";
    detailsButton.textContent = "Ürün Detayları";
    card.querySelector(".product-info").append(detailsButton);

    detailsButton.addEventListener("click", () => {
      activeProductCard = card;
      activeProductSize = null;
      const image = card.querySelector("img");
      dialogImage.src = image.currentSrc || image.src;
      dialogImage.alt = image.alt;
      dialogCategory.textContent = card.querySelector(".product-category")?.textContent || "";
      dialogTitle.textContent = card.querySelector("h3")?.textContent || "Ürün";
      dialogPrice.replaceChildren(card.querySelector(".product-price").cloneNode(true));
      dialogSizes.replaceChildren();
      dialogAddButton.disabled = true;

      card.querySelectorAll(".size-list button").forEach((sizeButton) => {
        const sizeOption = document.createElement("button");
        sizeOption.className = "product-dialog-size";
        sizeOption.type = "button";
        sizeOption.textContent = sizeButton.textContent.trim();
        sizeOption.setAttribute("aria-pressed", "false");
        sizeOption.addEventListener("click", () => {
          activeProductSize = sizeOption.textContent;
          dialogSizes.querySelectorAll("button").forEach((button) => {
            button.setAttribute("aria-pressed", String(button === sizeOption));
          });
          dialogAddButton.disabled = false;
        });
        dialogSizes.append(sizeOption);
      });

      productDialog.showModal();
    });
  });
  await loadFavorites();
  renderFavorites();

  productDialog.querySelector(".product-dialog-close").addEventListener("click", () => {
    productDialog.close();
  });

  productDialog.addEventListener("click", (event) => {
    if (event.target === productDialog) productDialog.close();
  });

  dialogAddButton.addEventListener("click", () => {
    if (!activeProductCard || !activeProductSize) return;
    const matchingSize = [...activeProductCard.querySelectorAll(".size-list button")]
      .find((button) => button.textContent.trim() === activeProductSize);
    if (!matchingSize) return;
    matchingSize.click();
    productDialog.close();
    activeProductCard.querySelector(".add-to-cart").click();
  });

  document.querySelectorAll(".size-list").forEach((sizeList) => {
    sizeList.addEventListener("click", (event) => {
      const selectedButton = event.target.closest("button");
      if (!selectedButton) return;

      sizeList.querySelectorAll("button").forEach((button) => {
        button.setAttribute("aria-pressed", String(button === selectedButton));
      });
    });
  });

  const cartToggle = document.querySelector(".cart-toggle");
  const cartPanel = document.querySelector("#cart-panel");
  const cartItemsList = document.querySelector(".cart-items");
  const cartCount = document.querySelector(".cart-count");
  const cartTotal = document.querySelector(".cart-total strong");
  const cartEmpty = document.querySelector(".cart-empty");
  const cartToast = document.querySelector(".cart-toast");
  const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

  let cart = { items: [], itemCount: 0, total: 0 };
  let cartMutationPending = false;

  const handleCartError = (error) => {
    if (error.status === 401) {
      window.location.assign("./giris.html");
      return;
    }
    if (error.status === 409) {
      showToast(`Stok uyarısı: ${error.message}`);
      return;
    }
    showToast(error.message || "Sepet sunucusuna ulaşılamadı.");
  };

  const renderCart = () => {
    cartItemsList.replaceChildren();
    const items = Array.isArray(cart.items) ? cart.items : [];
    items.forEach((item) => {
      const row = document.createElement("li");
      row.className = "cart-item";

      const label = document.createElement("span");
      label.className = "cart-item-label";
      label.textContent = `${item.name} · ${item.size} yaş${item.color ? ` · ${item.color}` : ""}`;
      const price = document.createElement("span");
      price.className = "cart-item-price";
      price.textContent = money.format(Number(item.lineTotal));

      const controls = document.createElement("div");
      controls.className = "cart-item-controls";
      const decrease = document.createElement("button");
      decrease.className = "cart-quantity-button";
      decrease.type = "button";
      decrease.dataset.cartAction = "quantity";
      decrease.dataset.itemId = item.id;
      decrease.dataset.quantity = String(Number(item.quantity) - 1);
      decrease.setAttribute("aria-label", `${item.name} miktarını azalt`);
      decrease.textContent = "−";
      decrease.disabled = Number(item.quantity) <= 1;
      const quantity = document.createElement("span");
      quantity.className = "cart-item-quantity";
      quantity.textContent = String(item.quantity);
      const increase = document.createElement("button");
      increase.className = "cart-quantity-button";
      increase.type = "button";
      increase.dataset.cartAction = "quantity";
      increase.dataset.itemId = item.id;
      increase.dataset.quantity = String(Number(item.quantity) + 1);
      increase.setAttribute("aria-label", `${item.name} miktarını artır`);
      increase.textContent = "+";
      increase.disabled = Number(item.quantity) >= 99 || Number(item.quantity) >= Number(item.stockQuantity);
      const remove = document.createElement("button");
      remove.className = "cart-remove";
      remove.type = "button";
      remove.dataset.cartAction = "remove";
      remove.dataset.itemId = item.id;
      remove.setAttribute("aria-label", `${item.name} ürününü sepetten sil`);
      remove.textContent = "Kaldır";

      controls.append(decrease, quantity, increase, remove);
      row.append(label, price, controls);
      cartItemsList.append(row);
    });

    const itemCount = Number(cart.itemCount) || 0;
    cartCount.textContent = String(itemCount);
    cartCount.setAttribute("aria-label", `Sepette ${itemCount} ürün var`);
    cartTotal.textContent = money.format(Number(cart.total) || 0);
    cartEmpty.hidden = items.length > 0;
    cartItemsList.hidden = items.length === 0;
  };

  const updateCart = async (path, options, successMessage) => {
    if (cartMutationPending) return;
    const currentUser = await (window.MODA_AUTH_READY || Promise.resolve(null));
    if (!currentUser) {
      window.location.assign("./giris.html");
      return;
    }

    cartMutationPending = true;
    try {
      cart = await requestStorefrontApi(path, options, "Sepet işlemi tamamlanamadı.");
      renderCart();
      if (successMessage) showToast(successMessage);
    } catch (error) {
      handleCartError(error);
    } finally {
      cartMutationPending = false;
    }
  };

  cartToggle.addEventListener("click", () => {
    const open = cartPanel.hidden;
    cartPanel.hidden = !open;
    cartToggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".cart-area")) {
      cartPanel.hidden = true;
      cartToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.querySelectorAll(".product-card .add-to-cart").forEach((addButton) => {
    addButton.addEventListener("click", async () => {
      const currentUser = await (window.MODA_AUTH_READY || Promise.resolve(null));
      if (!currentUser) {
        window.location.assign("./giris.html");
        return;
      }

      const card = addButton.closest(".product-card");
      const selectedSize = card.querySelector('.size-list button[aria-pressed="true"]');
      if (!selectedSize) {
        showToast("Önce bir beden seçmelisin.");
        card.querySelector(".size-list button")?.focus();
        return;
      }

      const variantId = selectedSize.dataset.variantId;
      if (!variantId) {
        showToast("Bu ürün için stok bilgisi bulunamadı.");
        return;
      }

      addButton.disabled = true;
      try {
        await updateCart("/cart/items", {
          method: "POST",
          body: JSON.stringify({ variantId, quantity: 1 }),
        }, "Ürün sepetine eklendi ♥");
      } finally {
        addButton.disabled = false;
      }
    });
  });

  cartItemsList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-cart-action]");
    if (!actionButton || actionButton.disabled) return;

    const itemId = encodeURIComponent(actionButton.dataset.itemId);
    if (actionButton.dataset.cartAction === "remove") {
      void updateCart(`/cart/items/${itemId}`, { method: "DELETE" }, "Ürün sepetten kaldırıldı.");
      return;
    }

    void updateCart(`/cart/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: Number(actionButton.dataset.quantity) }),
    }, "Sepet miktarı güncellendi.");
  });

  const cartUser = await (window.MODA_AUTH_READY || Promise.resolve(null));
  if (cartUser) {
    try {
      cart = await requestStorefrontApi("/cart", {}, "Sepet yüklenemedi.");
    } catch (error) {
      handleCartError(error);
    }
  }

  renderCart();
});
