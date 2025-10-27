(function () {
  const root = document.getElementById('ucbbq-bundle-root');
  if (!root) return;

  // ---- Helpers ----
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const toMoney = (cents) => (Number(cents) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  const fetchJSON = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Request failed: ' + url);
    return res.json();
  };

  const fetchProduct = (handle) => fetchJSON(`/products/${handle}.js`);
  const firstAvailableVariant = (p) => (p?.variants?.find(v => v.available) || p?.variants?.[0] || null);
  const fetchVariantId = async (handle) => {
    try {
      const p = await fetchProduct(handle);
      const v = firstAvailableVariant(p);
      return v ? v.id : null;
    } catch { return null; }
  };

  // ---- Legacy bucket vars (your original inputs) ----
  const productHandle = root.dataset.productHandle || '';
  const sauceCols = (root.dataset.sauceCollections || '').split(',').map(h => h.trim()).filter(Boolean);
  const rubCols   = (root.dataset.rubCollections   || '').split(',').map(h => h.trim()).filter(Boolean);
  const accCols   = (root.dataset.accessoryCollections || '').split(',').map(h => h.trim()).filter(Boolean);
  const maxItemsLegacy = Math.max(1, parseInt(root.dataset.maxItems || '4', 10));

  // ---- New toggle inputs from Liquid ----
  const dataSource   = root.dataset.source || 'manual'; // manual | metafield | collection
  const mfJSONRaw    = root.dataset.metafieldJson || '';
  const collHandle   = root.dataset.collectionHandle || '';
  const defaultQty   = Math.max(1, parseInt(root.dataset.defaultQty || '1', 10));
  const showPrices   = root.dataset.showPrices === 'true';
  const showCompare  = root.dataset.showCompare === 'true';
  const successText  = root.dataset.successText || 'Bundle added!';
  const viewCartUrl  = root.dataset.viewCartUrl || '/cart';

  // Detect UI type: new bundle block (carousel + CTA) vs legacy grid
  const trackEl = $('.ucbbq-bundle__track', root);
  const bundleCTA = $('.ucbbq-bundle__add', root);
  const statusEl = $('.ucbbq-bundle__status', root);

  // ------------------------------------------------------------
  // RENDERERS
  // ------------------------------------------------------------

  // Card for new bundle block
  const cardHTML = (p, qty) => {
    const v = firstAvailableVariant(p);
    const img = p?.images?.[0] || null;
    const url = p?.url || `/products/${p.handle}`;
    const priceHTML = showPrices ? `
      <div class="ucbbq-bundle__price">
        <span class="ucbbq-price">${toMoney(v ? v.price : 0)}</span>
        ${showCompare && v && v.compare_at_price > v.price ? `<s class="ucbbq-compare">${toMoney(v.compare_at_price)}</s>` : ``}
      </div>` : ``;

    return `
      <article class="ucbbq-bundle__card" data-product-handle="${p.handle}">
        <a class="ucbbq-bundle__img" href="${url}">
          ${img ? `<img loading="lazy" src="${img}" alt="${p.title}">` : ``}
        </a>
        <h4 class="ucbbq-bundle__card-title">${p.title}</h4>
        ${priceHTML}
        <div class="ucbbq-bundle__qty">
          <button class="ucbbq-qty minus" aria-label="minus">-</button>
          <input type="number" min="1" step="1" value="${qty}">
          <button class="ucbbq-qty plus" aria-label="plus">+</button>
        </div>
      </article>
    `;
  };

  // Legacy “grid” card (your original look, single-item add)
  const legacyCardHTML = (p) => {
    const v = firstAvailableVariant(p);
    const img = (p?.images?.[0] && (p.images[0].src || p.images[0])) || '';
    const url = `/products/${p.handle}`;
    return `
      <div class="ucbbq-card">
        <a class="ucbbq-img-wrap" href="${url}">
          ${img ? `<img src="${img}${img.includes('?') ? '&' : '?'}width=360" alt="${p.title}">` : ''}
        </a>
        <div class="ucbbq-info">
          <a class="ucbbq-title-link" href="${url}">${p.title}</a>
          ${v ? `<div class="ucbbq-price">${toMoney(v.price)}</div>` : ``}
          ${v ? `<button class="ucbbq-add" data-vid="${v.id}">Add</button>` : ``}
        </div>
      </div>
    `;
  };

  // Hook up +/- for new bundle cards
  const initQtyControls = () => {
    $$('.ucbbq-bundle__card', root).forEach(card => {
      const input = $('input[type="number"]', card);
      $('.ucbbq-qty.plus', card)?.addEventListener('click', () => {
        input.value = String(clamp((parseInt(input.value, 10) || 1) + 1, 1, 999));
      });
      $('.ucbbq-qty.minus', card)?.addEventListener('click', () => {
        input.value = String(clamp((parseInt(input.value, 10) || 1) - 1, 1, 999));
      });
    });
  };

  // Simple carousel nav
  const initCarousel = () => {
    const prev = $('.ucbbq-bundle__nav--prev', root);
    const next = $('.ucbbq-bundle__nav--next', root);
    if (!trackEl) return;
    let scroll = 0;
    const firstCard = $('.ucbbq-bundle__card', trackEl);
    const step = firstCard ? Math.ceil(firstCard.getBoundingClientRect().width + 16) : 320;
    prev?.addEventListener('click', () => {
      scroll = Math.max(0, scroll - step);
      trackEl.scrollTo({ left: scroll, behavior: 'smooth' });
    });
    next?.addEventListener('click', () => {
      scroll = Math.min(trackEl.scrollWidth, scroll + step);
      trackEl.scrollTo({ left: scroll, behavior: 'smooth' });
    });
  };

  // ------------------------------------------------------------
  // DATA COLLECTION (items to render)
  // ------------------------------------------------------------

  // MANUAL mode: cards already rendered by Liquid; we just read them later for add-to-cart
  const manualModeReady = () => dataSource === 'manual' && trackEl && $$('.ucbbq-bundle__card', trackEl).length > 0;

  // METAFIELD mode: parse JSON from data attr, then fetch products, render cards
  const runMetafieldMode = async () => {
    if (!mfJSONRaw) return;
    let items;
    try {
      items = JSON.parse(mfJSONRaw).slice(0, 6);
    } catch { items = []; }
    if (!items.length || !trackEl) return;

    const products = await Promise.all(items.map(async it => {
      try { return await fetchProduct(it.handle); } catch { return null; }
    }));

    const html = products.map((p, i) => p ? cardHTML(p, clamp(parseInt(items[i].qty || defaultQty, 10) || defaultQty, 1, 999)) : '').join('');
    trackEl.innerHTML = html;
    initQtyControls();
  };

  // COLLECTION mode: fetch first 6 from current collection, then render cards
  const runCollectionMode = async () => {
    if (!collHandle || !trackEl) return;
    try {
      const data = await fetchJSON(`/collections/${collHandle}/products.json?limit=6`);
      const prods = (data.products || []).slice(0, 6);
      const cards = await Promise.all(prods.map(async p => {
        // /products/<handle>.js gives us variants for pricing
        const full = await fetchProduct(p.handle);
        return cardHTML(full, defaultQty);
      }));
      trackEl.innerHTML = cards.join('');
      initQtyControls();
    } catch {
      // silently ignore
    }
  };

  // LEGACY bucket rendering (your original “grid” UX) when no new block structure present
  const runLegacyGrid = async () => {
    // Build the legacy wrapper exactly like your code did
    root.innerHTML = `
      <div class="ucbbq-wrap">
        <h3 class="ucbbq-title">Complete the combo</h3>
        <p class="ucbbq-sub">Add a rub and a sauce to unlock bundle savings.</p>
        <div class="ucbbq-grid" id="ucbbq-grid"></div>
      </div>
    `;
    const grid = document.getElementById('ucbbq-grid');

    const fetchCollection = async (handle) => {
      try {
        const res = await fetch(`/collections/${handle}/products.json?limit=${maxItemsLegacy}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.products) ? data.products.slice(0, maxItemsLegacy) : [];
      } catch {
        return [];
      }
    };

    const buckets = [sauceCols, rubCols, accCols].filter(arr => arr.length);
    const picked = [];
    for (const handles of buckets) {
      for (const h of handles) {
        if (picked.length >= maxItemsLegacy) break;
        const prods = await fetchCollection(h);
        for (const p of prods) {
          if (picked.length >= maxItemsLegacy) break;
          if (p.handle !== productHandle) picked.push(p);
        }
        if (picked.length >= maxItemsLegacy) break;
      }
      if (picked.length >= maxItemsLegacy) break;
    }

    if (!picked.length) {
      grid.innerHTML = `
        <div class="ucbbq-empty">
          No recommendations yet. Browse our <a href="/collections/sauces">sauces</a> and
          <a href="/collections/rubs">rubs</a>.
        </div>
      `;
      return;
    }

    // Fetch /products/<handle>.js to get variants for price & add buttons
    const fulls = await Promise.all(picked.map(p => fetchProduct(p.handle).catch(() => null)));
    grid.innerHTML = fulls.map(p => p ? legacyCardHTML(p) : '').join('');

    // Single-item add (legacy behavior)
    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.ucbbq-add');
      if (!btn) return;
      btn.disabled = true;
      try {
        await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ id: btn.dataset.vid, quantity: 1 })
        });
        btn.textContent = 'Added ✓';
      } catch {
        btn.textContent = 'Try again';
        btn.disabled = false;
      }
    });
  };

  // ------------------------------------------------------------
  // ADD-TO-CART (bundle, new block)
  // ------------------------------------------------------------
  const buildLinesFromCards = async () => {
    const cards = $$('.ucbbq-bundle__card', trackEl).slice(0, 6);
    const lines = [];
    for (const card of cards) {
      const handle = card.dataset.productHandle;
      const qty = clamp(parseInt($('input[type="number"]', card)?.value || '1', 10), 1, 999);
      if (!handle) continue;
      const vid = await fetchVariantId(handle);
      if (vid) lines.push({ id: vid, quantity: qty });
    }
    return lines;
  };

  const wireBundleCTA = () => {
    if (!bundleCTA) return;
    bundleCTA.addEventListener('click', async () => {
      if (statusEl) statusEl.hidden = true;
      try {
        const lines = await buildLinesFromCards();
        if (!lines.length) {
          if (statusEl) { statusEl.textContent = 'No available items to add.'; statusEl.hidden = false; }
          return;
        }
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ items: lines })
        });
        if (res.ok) {
          if (statusEl) { statusEl.textContent = successText; statusEl.hidden = false; }
          if (viewCartUrl && viewCartUrl !== '#') window.location.href = viewCartUrl;
        } else {
          if (statusEl) { statusEl.textContent = 'Could not add bundle.'; statusEl.hidden = false; }
        }
      } catch {
        if (statusEl) { statusEl.textContent = 'Something went wrong.'; statusEl.hidden = false; }
      }
    });
  };

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------
  (async function init() {
    // If we have the new block structure (track + CTA), use toggle modes
    if (trackEl && bundleCTA) {
      initCarousel();

      if (manualModeReady()) {
        // Liquid already rendered manual cards; just wire qty and CTA
        initQtyControls();
      } else if (dataSource === 'metafield') {
        await runMetafieldMode();
      } else if (dataSource === 'collection') {
        await runCollectionMode();
      } else {
        // If manual but no cards rendered (edge case), fall back to legacy
        await runLegacyGrid();
      }

      wireBundleCTA();
      return;
    }

    // Otherwise, we’re on the old/legacy markup → render legacy grid
    await runLegacyGrid();
  })();
})();