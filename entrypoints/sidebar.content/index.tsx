import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import { createRoot } from 'react-dom/client';
import React from 'react';
import App from './App';
import './style.css';

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://labs.google/*'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'flow-sidebar',
      position: 'inline',
      anchor: 'body',
      append: 'first',
      onMount: (container) => {
        // Contenedor React
        const wrapper = document.createElement('div');
        container.append(wrapper);
        
        // Hacer espacio en la página real (empujar a la derecha)
        document.documentElement.style.marginLeft = '350px';
        document.documentElement.style.transition = 'margin-left 0.3s ease';

        // Estilos del contenedor de nuestra UI para que se fije a la izquierda
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '350px';
        container.style.height = '100vh';
        container.style.zIndex = '999999';
        container.style.backgroundColor = '#111827'; // bg-gray-900

        const root = createRoot(wrapper);
        root.render(<App />);
        return root;
      },
      onRemove: (root) => {
        document.documentElement.style.marginLeft = '0';
        root?.unmount();
      },
    });

    ui.mount();
  },
});
