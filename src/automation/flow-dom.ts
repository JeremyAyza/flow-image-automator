/**
 * Módulo de utilidades DOM para Google Labs Flow (Angular).
 * Centraliza los selectores y operaciones sobre los tiles y el scroller.
 */

export const FlowDOM = {
  /**
   * Obtiene el contenedor de scroll y su altura.
   */
  getScroller(): { target: Element | Window; scrollHeight: number } {
    const list = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
    let target: Element | Window = window;
    let scrollHeight = document.body.scrollHeight;

    if (list) {
      let current: Element | null = list as Element;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          target = current;
          scrollHeight = current.scrollHeight;
          break;
        }
        current = current.parentElement;
      }
      if (target === window && list.parentElement) {
        target = list.parentElement;
        scrollHeight = list.parentElement.scrollHeight;
      }
    }
    return { target, scrollHeight };
  },

  /**
   * Obtiene todos los contenedores de tiles de imágenes visibles.
   */
  getTiles(): HTMLElement[] {
    // Buscar primero los flow-grid-tile-container
    const gridTiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container'));
    if (gridTiles.length > 0) return gridTiles;

    // Fallback a flow-image-tile
    const imageTiles = Array.from(document.querySelectorAll<HTMLElement>('flow-image-tile'));
    if (imageTiles.length > 0) return imageTiles;

    // Fallback por atributo data-media-id o contenedor legacy
    const mediaImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img[data-media-id]'));
    if (mediaImgs.length > 0) {
      return mediaImgs.map(img => (img.closest('flow-grid-tile-container, flow-image-tile') as HTMLElement) || img);
    }

    return Array.from(document.querySelectorAll<HTMLElement>('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
  },

  /**
   * Obtiene el elemento img principal dentro de un tile.
   */
  getTileImage(tile: HTMLElement): HTMLImageElement | null {
    if (tile instanceof HTMLImageElement) return tile;
    return tile.querySelector<HTMLImageElement>('img[data-media-id], img.image, img');
  },

  /**
   * Extrae el ID único del tile (prioriza data-media-id, luego fallback a data-tile-id o URL).
   */
  getMediaId(tile: HTMLElement): string | null {
    const img = this.getTileImage(tile);
    if (!img) return null;
    return (
      img.getAttribute('data-media-id') ||
      tile.getAttribute('data-tile-id') ||
      img.src.match(/(?:[?&]name=|\/image\/)([0-9a-f-]{36})/i)?.[1] ||
      null
    );
  },

  /**
   * Determina si un tile está marcado como favorito.
   * En Angular Flow:
   * - No-hover: .status-indicators-container mat-icon.fill con texto "favorite"
   * - Hover: button[aria-label="Quitar de favoritos"]
   */
  isFavorite(tile: HTMLElement): boolean {
    // 1. Indicador activo permanente (incluso sin hover)
    const activeIcon = tile.querySelector('.status-indicators-container mat-icon, mat-icon.fill');
    if (activeIcon && activeIcon.textContent?.trim() === 'favorite') {
      return true;
    }

    // 2. Botón con aria-label "Quitar de favoritos"
    const removeFavBtn = tile.querySelector('button[aria-label*="Quitar de favoritos" i], button[aria-label*="Remove from favorites" i]');
    if (removeFavBtn) {
      return true;
    }

    // 3. Fallback legacy
    const legacyFavIcons = Array.from(tile.querySelectorAll('i.google-symbols, mat-icon')).filter(
      i => i.textContent?.trim() === 'favorite' && !i.closest('[role="toolbar"]')
    );
    return legacyFavIcons.some(icon => icon.classList.contains('fill') || !icon.closest('flow-image-hotbar'));
  },

  /**
   * Obtiene todos los tiles favoritos.
   */
  getFavoriteTiles(): HTMLElement[] {
    return this.getTiles().filter(tile => this.isFavorite(tile));
  },

  /**
   * Obtiene el primer tile favorito.
   */
  findFavoriteTile(): HTMLElement | null {
    return this.getFavoriteTiles()[0] || null;
  }
};

// Declarar en window para acceso directo desde cualquier script ejecutado en MAIN world
if (typeof window !== 'undefined') {
  (window as any).__FLOW_DOM__ = FlowDOM;
}
