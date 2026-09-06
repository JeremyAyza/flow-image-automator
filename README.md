# 🚀 Flow Image Generator Extension

¡Hola! Si estás aquí, probablemente necesites entender cómo funciona esta extensión. No te preocupes, está diseñada de forma muy lógica para que cualquiera, desde un junior hasta un senior, pueda modificarla sin dolores de cabeza. 

Esta extensión automatiza la generación y descarga de imágenes en Google Labs (o plataformas similares de Google) a partir de una lista de prompts.

## 🏗️ Arquitectura Básica (Cómo funciona por debajo)

La extensión está construida con **WXT** (un framework moderno para extensiones de navegador) junto con **React** y **Zustand** para la interfaz de usuario. 

El sistema se divide en cuatro partes principales que trabajan en equipo:

### 1. El Background Script (`background.ts`) - El Cerebro 🧠
Es el orquestador principal del proceso. Mantiene y gestiona la **Cola (Queue)** de los prompts que el usuario quiere generar.
- **Acción**: Toma el siguiente prompt pendiente de la cola e inyecta comandos en la pestaña activa para interactuar con la interfaz de Google (busca el input, escribe el prompt y simula el click de enviar).
- **Descargas (Polling)**: Revisa el HTML de la página cada pocos segundos buscando nuevas imágenes generadas (usando el atributo `data-tile-id`). Cuando las imágenes están listas, las descarga automáticamente en segundo plano organizadas por carpetas.
- **Protección (Rate Limits)**: Si la API de Google nos bloquea temporalmente por pedir demasiadas imágenes rápido (error "too quickly"), el background pausa la cola por 60 segundos de forma automática.

### 2. El Injector Script (`injector.ts`) - El Espía 🕵️‍♂️
Este script se inyecta directamente en el entorno principal de la página web (`MAIN world`) justo antes de que cargue por completo (`document_start`).
- **¿Qué hace?**: Sobrescribe (intercepta) silenciosamente las funciones `fetch` y `XMLHttpRequest` del navegador.
- **¿Para qué?**: Para capturar las respuestas de la API de Google (específicamente llamadas a `/fx/api/trpc/` o `batchGenerateImages`). De aquí extrae datos cruciales como el `batchId` y el `mediaId` de las imágenes en proceso, enviándolos como un mensaje (`window.postMessage`) al resto de la extensión.

### 3. El Content Script (`content.ts`) - El Mensajero 📬
A diferencia del inyector, este script vive en un entorno aislado (`isolated world`) pero dentro de la misma pestaña.
- **¿Qué hace?**: Simplemente escucha los mensajes enviados por el "Espía" (buscando el tipo `FLOW_BATCH_RESPONSE`). Cuando los recibe, los reenvía de forma segura al "Cerebro" (`background.ts`) usando la API de Chrome (`chrome.runtime.sendMessage`).

### 4. El Popup (`entrypoints/popup/`) - La Interfaz 🖥️
- Es la ventana emergente de la extensión, construida en **React**.
- Utiliza **Zustand** (`useAppStore.ts`) para mantener el estado (por ejemplo, guardar la lista de prompts, el progreso, etc).
- Es el lugar donde el usuario interactúa, carga sus prompts y le da al botón de iniciar.

---

## 🔄 El Flujo de Vida de un Prompt (Paso a Paso)

1. **Inicio**: El usuario abre el popup, carga 10 prompts y le da a "Start".
2. **A la cola**: El Popup envía esa lista al `background.ts`.
3. **Inyección**: El `background.ts` inyecta un script en la página de Google que selecciona el cuadro de texto, escribe el "Prompt 1" y simula presionar la tecla "Enter".
4. **Interceptación**: La página web realiza su petición real a Google. El `injector.ts` la intercepta, lee la respuesta del servidor y extrae el `mediaId` de la imagen que apenas se va a generar.
5. **Mapeo**: El `background.ts` recibe ese `mediaId` y dice: *"Ah, esta imagen corresponde a mi Prompt 1"*.
6. **Descarga**: El `background.ts` revisa el HTML constantemente. Cuando el `mediaId` aparece en pantalla como una imagen completa, extrae la URL y la descarga a la computadora del usuario.
7. **Siguiente**: Marca el Prompt 1 como completado (`DOWNLOADED`) y avanza al Prompt 2 repitiendo el ciclo.

## 🛠️ Comandos Útiles para Desarrollar

- **Instalar dependencias**: `npm install` (Nota: El proyecto tiene un `bun.lock`, por lo que es preferible usar `bun install` si tienes Bun).
- **Iniciar en modo desarrollo**: `npm run dev` (Abre un navegador Chrome con la extensión cargada y recarga automáticamente tus cambios).
- **Iniciar en Firefox**: `npm run dev:firefox`
- **Compilar para producción**: `npm run build`

¡Y eso es todo! Si necesitas modificar la lógica profunda ve a `entrypoints/background.ts`. Si necesitas modificar cómo se intercepta la data, ve a `entrypoints/injector.ts`. ¡Éxito!
