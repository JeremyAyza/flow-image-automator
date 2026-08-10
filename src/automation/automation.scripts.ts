/**
 * Funciones de debug que se ejecutan en el MAIN world del tab activo.
 * Cada función retorna el resultado de executeScript para quien la llame.
 */

export function scriptScroll(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      console.log('[TEST 0] Buscando lista virtuoso...');
      const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');
      let targetScroller: Element | Window = window;
      let scrollHeight = document.body.scrollHeight;

      if (virtuosoList) {
        virtuosoList.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        let scroller = virtuosoList.parentElement;
        while (scroller && scroller !== document.body) {
          const style = window.getComputedStyle(scroller);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
          scroller = scroller.parentElement;
        }
        if (scroller && scroller !== document.body) { targetScroller = scroller; scrollHeight = scroller.scrollHeight; }
      }
      console.log('[TEST 0] Haciendo scroll al final...');
      targetScroller.scrollTo(0, scrollHeight);
      await new Promise(r => setTimeout(r, 800));
      targetScroller.scrollTo(0, 0);
      console.log('[TEST 0] Scroll completado');
    },
  });
}

export function scriptFindFavorite(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
      const favTile = tiles.find(t => {
        const hasFav = Array.from(t.querySelectorAll('i.google-symbols')).some(i => i.textContent?.trim() === 'favorite');
        return t.querySelector('img') && hasFav;
      }) as HTMLElement;
      if (favTile) { favTile.style.border = '5px solid red'; favTile.style.boxSizing = 'border-box'; console.log('[TEST 1] SUCCESS'); }
      else console.error('[TEST 1] FAIL: Favorite tile not found');
    },
  });
}

export function scriptRightClick(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
      const favTile = tiles.find(t => {
        const hasFav = Array.from(t.querySelectorAll('i.google-symbols')).some(i => i.textContent?.trim() === 'favorite');
        return t.querySelector('img') && hasFav;
      }) as HTMLElement;
      if (favTile) {
        favTile.style.border = '5px solid blue';
        const img = favTile.querySelector('img');
        if (img) {
          const rect = img.getBoundingClientRect();
          const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, button: 2 };
          img.dispatchEvent(new MouseEvent('mousedown', opts));
          img.dispatchEvent(new MouseEvent('mouseup', opts));
          img.dispatchEvent(new MouseEvent('contextmenu', opts));
          console.log('[TEST 2] SUCCESS');
        }
      } else console.error('[TEST 2] FAIL: Tile not found');
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
        return text.includes('añadir a la petición') || text.includes('add to prompt') || text.includes('use as reference');
      });
      if (addOpt) {
        (addOpt as HTMLElement).style.backgroundColor = 'lime';
        addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        const rk = Object.keys(addOpt).find(k => k.startsWith('__reactProps$'));
        if (rk) { const p = (addOpt as any)[rk]; if (p?.onClick) try { p.onClick({ preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: { isTrusted: true } }); } catch {} }
        console.log('[TEST 3] SUCCESS');
      } else console.error('[TEST 3] FAIL: "Añadir a la petición" not found');
    },
  });
}

export function scriptSelectLastThree(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))')) as HTMLElement[];
      for (const tile of tiles.slice(0, 3)) {
        tile.style.border = '5px solid red'; tile.style.boxSizing = 'border-box';
        const el = tile.querySelector('img') || tile;
        const rect = el.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, ctrlKey: true, metaKey: true };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        await new Promise(r => setTimeout(r, 300));
      }
      console.log('[TEST 4] Tiles seleccionados');
    },
  });
}

export function scriptDeleteSelected(tabId: number) {
  return chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const ev = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true, cancelable: true });
      const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
      (tiles[0] ?? document).dispatchEvent(ev);
      document.querySelector('[data-testid="virtuoso-item-list"]')?.parentElement?.dispatchEvent(ev);
      console.log('[TEST 5] Delete dispatched');
    },
  });
}
