/**
 * Funciones de prueba y debugging que se ejecutan en el MAIN world de la pestaña activa.
 */

// ── 1. Tiles e IDs ────────────────────────────────────────────────────────────

export function scriptDetectTiles(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      let tiles: HTMLElement[] = [];
      if ((window as any).__FLOW_DOM__?.getTiles) {
        tiles = (window as any).__FLOW_DOM__.getTiles();
      }
      if (tiles.length === 0) {
        tiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container, flow-image-tile, [data-tile-id]'));
      }

      console.log(`[DEBUG: TILES] Detectados ${tiles.length} tiles`);
      tiles.forEach((t, idx) => {
        t.style.outline = '3px solid #22c55e';
        t.style.outlineOffset = '-3px';
      });

      setTimeout(() => {
        tiles.forEach(t => { t.style.outline = ''; t.style.outlineOffset = ''; });
      }, 3500);

      return tiles.length;
    },
  });
}

export function scriptLogMediaIds(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const items: { index: number; mediaId: string | null; src: string }[] = [];
      const mediaImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-media-id], flow-image-tile img'));
      
      mediaImgs.forEach((img, idx) => {
        const mediaId = img.getAttribute('data-media-id') || img.src.match(/(?:[?&]name=|\/image\/)([0-9a-f-]{36})/i)?.[1] || null;
        items.push({ index: idx + 1, mediaId, src: img.src.slice(0, 80) + '...' });
      });

      console.log(`[DEBUG: MEDIA IDs] Total imágenes: ${items.length}`);
      console.table(items);
      return items.length;
    },
  });
}

// ── 2. Favoritos y Referencias ────────────────────────────────────────────────

export function scriptFindFavorite(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      let favTile: HTMLElement | null = null;
      if ((window as any).__FLOW_DOM__?.findFavoriteTile) {
        favTile = (window as any).__FLOW_DOM__.findFavoriteTile();
      }
      if (!favTile) {
        const tiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container, flow-image-tile, [data-tile-id]'));
        favTile = tiles.find(t => {
          const activeIcon = t.querySelector('.status-indicators-container mat-icon, mat-icon.fill');
          if (activeIcon && activeIcon.textContent?.trim() === 'favorite') return true;
          const removeFavBtn = t.querySelector('button[aria-label*="Quitar de favoritos" i], button[aria-label*="Remove from favorites" i]');
          if (removeFavBtn) return true;
          const legacyFav = Array.from(t.querySelectorAll('i.google-symbols, mat-icon')).some(
            i => i.textContent?.trim() === 'favorite' && !i.closest('[role="toolbar"]') && i.classList.contains('fill')
          );
          return t.querySelector('img') && legacyFav;
        }) ?? null;
      }

      if (favTile) {
        favTile.style.border = '5px solid #ef4444';
        favTile.style.boxSizing = 'border-box';
        console.log('[DEBUG: FAV] Tile favorito encontrado:', favTile);
        setTimeout(() => { favTile!.style.border = ''; }, 3500);
      } else {
        console.warn('[DEBUG: FAV] No se encontró ningún tile marcado como favorito.');
      }
    },
  });
}

export function scriptRightClick(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      let targetTile: HTMLElement | null = null;
      if ((window as any).__FLOW_DOM__?.findFavoriteTile) {
        targetTile = (window as any).__FLOW_DOM__.findFavoriteTile();
      }
      if (!targetTile) {
        const tiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container, flow-image-tile, [data-tile-id]'));
        targetTile = tiles.find(t => {
          const activeIcon = t.querySelector('.status-indicators-container mat-icon, mat-icon.fill');
          return activeIcon && activeIcon.textContent?.trim() === 'favorite';
        }) ?? tiles[0] ?? null;
      }

      if (targetTile) {
        targetTile.style.border = '5px solid #3b82f6';
        const img = targetTile.querySelector('img') || targetTile;
        const rect = img.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, button: 2 };
        img.dispatchEvent(new MouseEvent('mousedown', opts));
        img.dispatchEvent(new MouseEvent('mouseup', opts));
        img.dispatchEvent(new MouseEvent('contextmenu', opts));
        console.log('[DEBUG: RIGHT CLICK] contextmenu disparado en:', targetTile);
        setTimeout(() => { targetTile!.style.border = ''; }, 3500);
      } else {
        console.error('[DEBUG: RIGHT CLICK] No se encontró tile para click derecho.');
      }
    },
  });
}

export function scriptClickAdd(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const addOpt = Array.from(document.querySelectorAll('[role="menuitem"], button')).find(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('añadir a la petición') || text.includes('add to prompt') || text.includes('use as reference') || text.includes('agregar a la instrucción');
      });
      if (addOpt) {
        (addOpt as HTMLElement).style.backgroundColor = '#22c55e';
        addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        const rk = Object.keys(addOpt).find(k => k.startsWith('__reactProps$'));
        if (rk) { const p = (addOpt as any)[rk]; if (p?.onClick) try { p.onClick({ preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: { isTrusted: true } }); } catch {} }
        console.log('[DEBUG: CLICK ADD] Opción clickeada exitosamente.');
      } else {
        console.error('[DEBUG: CLICK ADD] Menú "Añadir a la petición" no encontrado.');
      }
    },
  });
}

// ── 3. Editor de Prompts y Botón Enviar ────────────────────────────────────────

export function scriptFindEditor(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const editor = document.querySelector<HTMLElement>('[data-slate-editor="true"], [contenteditable="true"]');
      if (editor) {
        editor.style.outline = '3px solid #eab308';
        editor.focus();
        console.log('[DEBUG: EDITOR] Editor encontrado y enfocado:', editor);
        setTimeout(() => { editor.style.outline = ''; }, 3500);
      } else {
        console.error('[DEBUG: EDITOR] Editor de texto no encontrado.');
      }
    },
  });
}

export function scriptFindSendBtn(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const sendBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const icon = b.querySelector('i.google-symbols, mat-icon');
        return icon?.textContent?.trim() === 'arrow_forward';
      });
      if (sendBtn) {
        sendBtn.style.outline = '3px solid #06b6d4';
        console.log('[DEBUG: SEND BTN] Botón Enviar encontrado:', sendBtn);
        setTimeout(() => { sendBtn.style.outline = ''; }, 3500);
      } else {
        console.error('[DEBUG: SEND BTN] Botón con ícono arrow_forward no encontrado.');
      }
    },
  });
}

// ── 4. Scroll y Selección ─────────────────────────────────────────────────────

export function scriptScroll(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      console.log('[DEBUG: SCROLL] Buscando contenedor...');
      const scrollerInfo = (window as any).__FLOW_DOM__?.getScroller();
      let targetScroller: Element | Window = scrollerInfo?.target ?? window;
      let scrollHeight = scrollerInfo?.scrollHeight ?? document.body.scrollHeight;

      if (!scrollerInfo || targetScroller === window) {
        const list = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
        if (list) {
          list.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          let scroller = list.parentElement;
          while (scroller && scroller !== document.body) {
            const style = window.getComputedStyle(scroller);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) {
            targetScroller = scroller;
            scrollHeight = scroller.scrollHeight;
          } else if (list.parentElement) {
            targetScroller = list.parentElement;
            scrollHeight = list.parentElement.scrollHeight;
          }
        }
      }

      console.log('[DEBUG: SCROLL] Desplazando al final (altura:', scrollHeight, ')');
      if (targetScroller !== window) {
        (targetScroller as HTMLElement).focus();
        (targetScroller as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', keyCode: 35, bubbles: true, cancelable: true }));
      }
      targetScroller.scrollTo({ top: scrollHeight, behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 800));
      console.log('[DEBUG: SCROLL] Scroll completado.');
    },
  });
}

export function scriptSelectLastThree(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      let tiles: HTMLElement[] = [];
      if ((window as any).__FLOW_DOM__?.getTiles) {
        tiles = (window as any).__FLOW_DOM__.getTiles();
      }
      if (tiles.length === 0) {
        tiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container, flow-image-tile, [data-tile-id]:has(img)'));
      }

      console.log(`[DEBUG: SELECT 3] Seleccionando 3 de ${tiles.length} tiles...`);
      for (const tile of tiles.slice(0, 3)) {
        tile.style.border = '5px solid #ef4444';
        tile.style.boxSizing = 'border-box';
        const el = tile.querySelector('img') || tile;
        const rect = el.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, ctrlKey: true, metaKey: true };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        await new Promise(r => setTimeout(r, 300));
      }
      console.log('[DEBUG: SELECT 3] 3 tiles seleccionados con Ctrl+Click.');
    },
  });
}

export function scriptDeleteSelected(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const ev = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true, cancelable: true });
      const tiles = Array.from(document.querySelectorAll('flow-grid-tile-container, flow-image-tile, [data-tile-id]'));
      (tiles[0] ?? document).dispatchEvent(ev);
      const scroller = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
      (scroller?.parentElement ?? scroller)?.dispatchEvent(ev);
      console.log('[DEBUG: DELETE] Evento Delete emitido.');
    },
  });
}
