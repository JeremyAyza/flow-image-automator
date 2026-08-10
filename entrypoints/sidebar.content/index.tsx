import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';
import './style.css';

export default defineContentScript({
  matches: ['*://labs.google/*'],

  cssInjectionMode: 'ui',
  async main(ctx) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const ui = await createShadowRootUi(ctx, {
      name: 'flow-sidebar',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: (container) => {
        const wrapper = document.createElement('div');
        container.append(wrapper);
        const root = createRoot(wrapper);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();

    // Los eventos de puntero/teclado son "composed" y cruzan el Shadow DOM boundary.
    // Los interceptamos en el shadowHost para que no lleguen a los handlers globales de Google Labs.
    // - paste / keydown(Ctrl+V, Ctrl+A): evita el toast "No hay imagen para copiar" y selección masiva.
    // - mousedown / pointerdown: Radix UI los usa para detectar "click fuera" y cerrar sus menús contextuales.
    ui.shadowHost.addEventListener('paste', (e) => e.stopPropagation());
    ui.shadowHost.addEventListener('mousedown', (e) => e.stopPropagation());
    ui.shadowHost.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.shadowHost.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'a')) e.stopPropagation();
    });
  },
});


