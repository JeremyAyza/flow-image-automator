import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';
import './style.css';

export default defineContentScript({
  matches: ['*://labs.google/*'],

  cssInjectionMode: 'ui',
  async main(ctx) {
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

    // Los eventos 'paste' y 'keydown' son "composed": cruzan el Shadow DOM boundary
    // y llegan a los listeners globales de Google Labs.
    // Los interceptamos en el shadowHost (DOM real) DESPUÉS de que el textarea ya los procesó,
    // deteniéndolos antes de que suban a document/window donde Google los captura.
    ui.shadowHost.addEventListener('paste', (e) => e.stopPropagation());
    ui.shadowHost.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'a')) e.stopPropagation();
    });
  },
});


