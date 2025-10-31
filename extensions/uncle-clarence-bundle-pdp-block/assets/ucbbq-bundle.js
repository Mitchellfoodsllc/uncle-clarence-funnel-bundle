(function () {
  const root = document.getElementById('ucbbq-bundle-root');
  if (!root) return;

  console.log('UC Smart Bundle JS v2.3 — loaded');

  // --------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const toMoney = (cents) => (Number(cents) / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  const fetchJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); };
  const fetchProduct = (handle) => fetchJSON(`/products/${handle}.js`);
  const firstAvailableVariant = (p) => (p?.variants?.find(v => v.available) || p?.variants?.[0] || null);
  const fetchVariantId = async (handle) => { try { const p = await fetchProduct(handle); const v = firstAvailableVariant(p); return v ? v.id : null; } catch { return null; } };

  // --------- Data from Liquid ----------
  const currentHandle = root.dataset.productHandle || '';
  const currentVariantId = parseInt(root.dataset.currentVariantId || '', 10);
  const source = root.dataset.source || 'manual';
  const mfJSONRaw = root.dataset.metafieldJson || '';
  const collHandle = root.dataset.collectionHandle || '';
  const pickedCollections = (root.dataset.pickedCollections || '').split(',').map(s => s.trim()).filter(Boolean);

  const maxItems = Math.max(1, parseInt(root.dataset.maxItems || '4', 10));
  const excludeCurrent = String(root.dataset.excludeCurrent || 'true') === 'true';
  const defaultQty = Math.max(1, parseInt(root.dataset.defaultQty || '1', 10));
  const showPrices = String(root.dataset.showPrices) === 'true';
  const showCompare = String(root.dataset.showCompare) === 'true';
  const successText = root.dataset.successText || 'Bundle added!';
  const viewCartUrl = root.dataset.viewCartUrl || '/cart';

  const enableTiers = String(root.dataset.enableTiers || 'false') === 'true';
  const tier2Qty = parseInt(root.dataset.tier2Qty || '2', 10);
  const tier3Qty = parseInt(root.dataset.tier3Qty || '3', 10);
  const tier2Code = (root.dataset.tier2Code || 'TIER2').trim();
  const tier3Code = (root.dataset.tier3Code || 'TIER3').trim();
  const tier2Pct = parseInt(root.dataset.tier2Pct || '5', 10);
  const tier3Pct = parseInt(root.dataset.tier3Pct || '10', 10);

  // --------- DOM ----------
  const trackEl = $('.ucbb-bundle__track', root);
  const bundleCTA = $('.ucbb-bundle__add', root);
  const statusEl = $('.ucbb-bundle__status', root);

  // --------- Utils ----------
  const uniqueByHandle = (arr) => {
    const seen = new Set();
    return arr.filter(p => p && p.handle && !seen.has(p.handle) && seen.add(p.handle));
  };
  const applyCapAndExclude = (prods) => {
    let out = prods.filter(Boolean);
    if (excludeCurrent) out = out.filter(p => p.handle !== currentHandle);
    out = uniqueByHandle(out);
    return out.slice(0, maxItems);
  };

  // Tier message ensure (kept for safety)
  function ensureTierLine() {
    let line = root.querySelector('.ucbb-bundle__tiers');
    const show = enableTiers && ((tier2Qty && tier2Pct) || (tier3Qty && tier3Pct));
    if (!show) { if (line) line.remove(); return; }
    if (!line) {
      const head = root.querySelector('.ucbb-bundle__head') || root;
      line = document.createElement('p');
      line.className = 'ucbb-bundle__tiers';
      head.appendChild(line);
    }
    const parts = [];
    if (tier2Qty && tier2Pct) parts.push(`Buy ${tier2Qty}+ save ${tier2Pct}%`);
    if (tier3Qty && tier3Pct) parts.push(`Buy ${tier3Qty}+ save ${tier3Pct}%`);
    line.textContent = parts.join(' • ');
  }

  // Quick-deal buttons (2/3 pack for current product)
  function wireQuickDeals() {
    if (!currentVariantId) return;
    root.querySelectorAll('.ucbb-quickdeal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qty = Math.max(1, parseInt(btn.dataset.qty || '1', 10));
        const code = (btn.dataset.code || '').trim();
        try {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ items: [{ id: currentVariantId, quantity: qty }] })
          });
          if (res.ok) {
            const u = new URL(viewCartUrl || '/cart', window.location.origin);
            if (code && !u.searchParams.get('discount')) u.searchParams.set('discount', code);
            window.location.href = u.pathname + '?' + u.searchParams.toString();
          }
        } catch (e) {
          console.error('[UC Bundles] quickdeal error', e);
        }
      });
    });
  }

  // --------- Card renderers ----------
  const cardHTML = (p, qty) => {
    const v = firstAvailableVariant(p);
    const img = (p?.images && p.images[0]) || null;
    const url = `/products/${p.handle}`;
    const priceHTML = showPrices ? `
      <div class="ucbb-bundle__price">
        <span class="ucbb-price">${toMoney(v ? v.price : 0)}</span>
        ${showCompare && v && v.compare_at_price > v.price ? `<s class="ucbb-compare">${toMoney(v.compare_at_price)}</s>` : ``}
      </div>` : ``;

    return `
      <article class="ucbb-bundle__card" data-product-handle="${p.handle}">
        <a class="ucbb-bundle__img" href="${url}">${img ? `<img loading="lazy" src="${img}" alt="${p.title}">` : ``}</a>
        <h4 class="ucbb-bundle__card-title">${p.title}</h4>
        ${priceHTML}
        <div class="ucbb-bundle__qty">
          <button class="ucbb-qty minus" aria-label="minus">-</button>
          <input type="number" min="1" step="1" value="${qty}">
          <button class="ucbb-qty plus" aria-label="plus">+</button>
        </div>
      </article>`;
  };

  const initQtyControls = () => {
    $$('.ucbb-bundle__card', root).forEach(card => {
      const input = card.querySelector('input[type="number"]');
      card.querySelector('.ucbb-qty.plus')?.addEventListener('click', () => {
        input.value = String(clamp((parseInt(input.value, 10) || 1) + 1, 1, 999));
      });
      card.querySelector('.ucbb-qty.minus')?.addEventListener('click', () => {
        input.value = String(clamp((parseInt(input.value, 10) || 1) - 1, 1, 999));
      });
    });
  };

  const initCarousel = () => {
    if (!trackEl) return;
    const prev = $('.ucbb-bundle__nav--prev', root);
    const next = $('.ucbb-bundle__nav--next', root);
    let scroll = 0;
    const firstCard = $('.ucbb-bundle__card', trackEl);
    const step = firstCard ? Math.ceil(firstCard.getBoundingClientRect().width + 16) : 320;
    prev?.addEventListener('click', () => { scroll = Math.max(0, scroll - step); trackEl.scrollTo({ left: scroll, behavior: 'smooth' }); });
    next?.addEventListener('click', () => { scroll = Math.min(trackEl.scrollWidth, scroll + step); trackEl.scrollTo({ left: scroll, behavior: 'smooth' }); });
  };

  // --------- Data source runners ----------
  const manualReady = () => source === 'manual' && trackEl && $$('.ucbb-bundle__card', trackEl).length > 0;

  const parseMetafieldItems = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      const items = (Array.isArray(parsed) ? parsed : []).map(it => {
        if (typeof it === 'string') return { handle: it, qty: defaultQty };
        if (typeof it === 'object' && it.handle) return { handle: it.handle, qty: parseInt(it.qty || defaultQty, 10) };
        return null;
      }).filter(Boolean);
      let out = items;
      if (excludeCurrent) out = out.filter(x => x.handle !== currentHandle);
      const seen = new Set(); const uniq = [];
      for (const x of out) { if (seen.has(x.handle)) continue; seen.add(x.handle); uniq.push(x); if (uniq.length >= maxItems) break; }
      return uniq;
    } catch { return []; }
  };

  const runMetafield = async () => {
    if (!mfJSONRaw || !trackEl) return;
    const items = parseMetafieldItems(mfJSONRaw);
    const products = await Promise.all(items.map(it => fetchProduct(it.handle).catch(() => null)));
    const cards = products.map((p, i) => p ? cardHTML(p, clamp(items[i].qty || defaultQty, 1, 999)) : '').join('');
    trackEl.innerHTML = cards; initQtyControls();
  };

  const runCollectionPage = async () => {
    if (!collHandle || !trackEl) return;
    try {
      const data = await fetchJSON(`/collections/${collHandle}/products.json?limit=${maxItems}`);
      let prods = (data.products || []).map(p => ({ handle: p.handle }));
      if (excludeCurrent) prods = prods.filter(x => x.handle !== currentHandle);
      prods = prods.slice(0, maxItems);
      const fulls = await Promise.all(prods.map(x => fetchProduct(x.handle).catch(() => null)));
      trackEl.innerHTML = fulls.filter(Boolean).map(full => cardHTML(full, defaultQty)).join('');
      initQtyControls();
    } catch {}
  };

  const runCollectionsPick = async () => {
    if (!pickedCollections.length || !trackEl) return;
    const fetchCol = async (h) => {
      try { return await fetchJSON(`/collections/${h}/products.json?limit=${maxItems}`); } catch { return { products: [] }; }
    };
    let merged = [];
    for (const h of pickedCollections) {
      const data = await fetchCol(h);
      merged = merged.concat((data.products || []).map(p => ({ handle: p.handle })));
      if (merged.length >= maxItems * 2) break; // soft guard
    }
    let uniq = [];
    const seen = new Set();
    for (const x of merged) {
      if (!x || !x.handle) continue;
      if (excludeCurrent && x.handle === currentHandle) continue;
      if (seen.has(x.handle)) continue;
      seen.add(x.handle); uniq.push(x);
      if (uniq.length >= maxItems) break;
    }
    const fulls = await Promise.all(uniq.map(x => fetchProduct(x.handle).catch(() => null)));
    trackEl.innerHTML = fulls.filter(Boolean).map(full => cardHTML(full, defaultQty)).join('');
    initQtyControls();
  };

  // --------- Add-to-cart bundle CTA ----------
  const buildLinesFromCards = async () => {
    const cards = $$('.ucbb-bundle__card', trackEl)
      .filter(c => !!c.dataset.productHandle && (!excludeCurrent || c.dataset.productHandle !== currentHandle))
      .slice(0, maxItems);
    const lines = [];
    for (const card of cards) {
      const handle = card.dataset.productHandle;
      const qty = clamp(parseInt(card.querySelector('input')?.value || '1', 10), 1, 999);
      const vid = await fetchVariantId(handle);
      if (vid) lines.push({ id: vid, quantity: qty });
    }
    return lines;
  };

  const pickTierCode = (qty) => {
    if (!enableTiers) return '';
    if (tier3Code && qty >= tier3Qty) return tier3Code;
    if (tier2Code && qty >= tier2Qty) return tier2Code;
    return '';
  };

  const withDiscount = (url, code) => {
    if (!code) return url || '/cart';
    const u = new URL(url || '/cart', window.location.origin);
    if (!u.searchParams.get('discount')) u.searchParams.set('discount', code);
    return u.pathname + '?' + u.searchParams.toString();
  };

  const wireCTA = () => {
    if (!bundleCTA) return;
    bundleCTA.addEventListener('click', async () => {
      if (statusEl) statusEl.hidden = true;
      try {
        const items = await buildLinesFromCards();
        if (!items.length) {
          if (statusEl) { statusEl.textContent = 'No available items to add.'; statusEl.hidden = false; }
          return;
        }
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ items })
        });
        if (res.ok) {
          const totalQty = items.reduce((a, l) => a + (parseInt(l.quantity, 10) || 0), 0);
          const code = pickTierCode(totalQty);
          const target = withDiscount(viewCartUrl, code);
          if (statusEl) { statusEl.textContent = successText; statusEl.hidden = false; }
          window.dispatchEvent(new CustomEvent('ucbundles:added', { detail: { qty: totalQty, items, code } }));
          if (target && target !== '#') window.location.href = target;
        } else {
          if (statusEl) { statusEl.textContent = 'Could not add bundle.'; statusEl.hidden = false; }
        }
      } catch (e) {
        if (statusEl) { statusEl.textContent = 'Something went wrong.'; statusEl.hidden = false; }
        console.error('[UC Bundles] add error:', e);
      }
    });
  };

  // --------- Init ----------
  (async function init() {
    initCarousel();
    if (source === 'manual' && manualReady()) {
      initQtyControls();
    } else if (source === 'metafield') {
      await runMetafield();
    } else if (source === 'collection') {
      await runCollectionPage();
    } else if (source === 'collections_pick') {
      await runCollectionsPick();
    }
    ensureTierLine();
    wireQuickDeals();
    wireCTA();
  })();
})();