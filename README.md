# Google Flow Image Generator Extension

Extensión de navegador Manifest V3 para interceptar, organizar y gestionar la cola de generación de imágenes en Google Flow.

> **Aviso de demostración:** Esta extensión requiere una sesión activa del usuario en Google Flow. Las capturas visuales y GIFs del panel lateral deben ser grabados directamente en el entorno con sesión iniciada.

## Qué resuelve

Facilita la generación masiva de imágenes mediante la interceptación client-side de peticiones a la API de Google Flow. Controla la concurrencia, reintenta automáticamente ante errores de cuota (HTTP 429) y expone un panel lateral interactivo para la gestión de prompts.

## Cómo funciona

1. **Inyección en MAIN World:** Intercepta `window.fetch` y `XMLHttpRequest` para capturar identificadores de estado y respuestas de la API de Google Flow.
2. **Sincronización de eventos:** Envía mensajes al Content Script y Service Worker (`background.ts`) para mantener el estado global.
3. **Gestión de Cola:** Ordena las solicitudes con `p-queue` aplicando pausa exponencial cuando se alcanza el límite de velocidad.
4. **Interfaz React:** Renderiza un panel lateral con Zustand y Tailwind CSS para pausar, reanudar o reordenar la cola.

## Guía de uso

### Requisitos
- Node.js 18+ o Node.js 20+
- npm 9+
- Google Chrome

### Instalación
```bash
git clone https://github.com/JeremyAyza/google-flow-automation-extension.git
cd google-flow-automation-extension
npm install
```

### Construcción
```bash
npm run build
```

### Cargar en Chrome
1. Abre `chrome://extensions/` en Google Chrome.
2. Activa el **Modo de desarrollador** (esquina superior derecha).
3. Haz clic en **Cargar descomprimida** y selecciona la carpeta `.output/chrome-mv3`.

## Decisiones técnicas

- **WXT Framework:** Permite empaquetar de forma agnóstica para Chrome Manifest V3 usando TypeScript y React 19.
- **Main World Injector:** Necesario para interceptar la API nativa de `fetch` dentro del contexto de la página de Google Flow.
- **Zustand + Immer:** Simplifica la reactividad del estado de la cola sin sobrecargar el hilo del Service Worker.
- **p-queue:** Garantiza un control estricto de concurrencia y reintentos ante límites de tasa (rate limits).

## Estado y límites conocidos

- **Estado:** Prototipo funcional probado en entorno de desarrollo.
- **Límites:** Depende estrictamente de los selectores Angular del DOM de Google Flow. Si Google modifica la estructura web, los selectores deben actualizarse.
- **Pruebas:** Cobertura de pruebas unitarias no implementada.

## Créditos y licencia

- **Autor:** Jeremy Ayza ([JeremyAyza](https://github.com/JeremyAyza))
- **Licencia:** MIT License
