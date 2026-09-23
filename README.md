# Mapa de Prospectos Locales

Extensión personal diseñada principalmente para **Opera GX** —y compatible con otros navegadores Chromium— que convierte Google Maps en un pequeño CRM visual. Al seleccionar un negocio, muestra una ficha flotante para guardar teléfono, página web, dirección, estado comercial, último contacto y notas.

Los datos se guardan localmente mediante `chrome.storage.local`. No necesita servidor, cuenta, clave de Google Maps ni conexión con una API externa. La vista **Ver base** permite buscar, filtrar, editar e importar/exportar los registros.

## Funciones incluidas

- Activación automática al cargar Google Maps; al hacer clic en un negocio aparece su ficha sin depender del icono.
- Detección de la ficha de negocio que esté abierta en Google Maps.
- Captura automática, cuando Maps los expone, de nombre, dirección, teléfono, web, URL y coordenadas.
- Estados con colores: sin revisar, pendiente, por contactar, contactado, interesado, cotización enviada, cliente, no interesado y no contactar.
- Marcadores propios con color e icono según el estado, además de etiquetas sobre los resultados visibles.
- Anclaje preferente al marcador accesible de Google Maps; los marcadores proyectados se ocultan durante el arrastre o zoom y reaparecen recalculados al terminar.
- Espera de estabilización: los puntos solo reaparecen cuando centro y zoom llevan un intervalo sin cambiar, evitando mostrar posiciones anteriores.
- Umbral de zoom configurable para ocultar los puntos cuando se observa una ciudad completa.
- Sincronización opcional del estado con listas nativas de Google Maps.
- Panel flotante dentro de Google Maps.
- Base completa en una pestaña propia, con búsqueda, filtros, estadísticas y edición manual.
- Exportación CSV compatible con Excel y Google Sheets.
- Importación CSV, TXT delimitado o respaldo JSON.
- Respaldo JSON sin pérdida de campos internos.

## Instalación en Opera GX (navegador principal)

1. Abre `opera://extensions` o pulsa `Ctrl + Shift + E`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `D:\git clonados\extension-mapa`.
5. Abre o recarga Google Maps. La extensión se inicia automáticamente.
6. Haz clic en un negocio: su ficha aparecerá sin necesidad de pulsar el icono. El icono de la extensión queda como forma alternativa de mostrar el panel.

Opera GX está basado en Chromium y esta extensión usa exclusivamente APIs `chrome.*` compatibles: `action`, `tabs`, `runtime` y `storage`. El permiso `tabs` está declarado explícitamente porque Opera lo exige para esas operaciones. No utiliza APIs exclusivas de Google Chrome, código remoto ni dependencias externas.

## Instalación alternativa en Google Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** en la esquina superior derecha.
3. Pulsa **Cargar descomprimida**.
4. Selecciona esta carpeta.

## Uso diario

1. Abre `https://www.google.com/maps` o la versión peruana `https://www.google.com.pe/maps`.
2. Busca una categoría o zona y abre un negocio; el panel aparecerá automáticamente.
3. Si ocultaste el panel, vuelve a hacer clic en un negocio o pulsa el icono de la extensión.
4. Completa o corrige teléfono, web, estado y notas; luego pulsa **Guardar negocio**.
5. Usa **Ver base** para consultar todos los registros.
6. Pulsa **Exportar CSV** para analizar la base en Excel o subirla a Google Sheets.

## Configurar listas nativas de Google Maps

Google Maps no ofrece una API pública para administrar las listas guardadas. La extensión sincroniza el estado mediante el cuadro nativo **Guardar** de la ficha seleccionada. Antes de usarlo, crea estas listas una sola vez desde **Guardados → Nueva lista** y asigna el emoji indicado con **Elegir emoji**:

- ⚪ `CRM · Sin revisar`
- 🟡 `CRM · Pendiente`
- 🟣 `CRM · Por contactar`
- 🔵 `CRM · Contactado`
- 🩵 `CRM · Interesado`
- 🩷 `CRM · Cotización enviada`
- 🟢 `CRM · Cliente`
- 🔴 `CRM · No interesado`
- ⚫ `CRM · No contactar`

Los nombres deben coincidir, incluidos `CRM`, el punto central `·` y las mayúsculas. Al guardar una ficha con **Sincronizar el estado con una lista de Google Maps** activado, la extensión desmarca las demás listas CRM y marca la correspondiente al estado actual. Si Google cambia internamente el diálogo Guardar, el registro local seguirá guardándose y el panel mostrará que la sincronización de la lista no se pudo completar.

## Ajustar visibilidad y movimiento

En la página **Ver base** hay una franja llamada **Visibilidad del mapa**. Sus valores se guardan junto con la configuración de la extensión:

- **Zoom mínimo:** los puntos solo se muestran cuando el zoom actual es igual o superior. El valor inicial es `15`, aproximadamente nivel de calles. Como referencia, Google considera `10` una vista de ciudad y `20` una vista de edificios.
- **Espera al detenerse:** tiempo durante el cual centro y zoom deben permanecer estables antes de calcular y mostrar los puntos. El valor inicial es `700 ms`.

Durante cualquier arrastre o cambio de zoom, tanto la capa proyectada como las insignias adheridas a marcadores de Google se ocultan inmediatamente. La extensión no reutiliza la posición anterior: espera la estabilidad configurada, calcula con la vista definitiva y después muestra los puntos.

El CSV se guarda con codificación UTF-8 y encabezados en español. Si importas un archivo, la extensión intenta reconocer encabezados comunes en español e inglés. Los registros se combinan por ID o por la pareja nombre + dirección para reducir duplicados.

## Formato recomendado para importar desde Excel

Guarda la hoja como CSV UTF-8. Se reconocen estas columnas (no todas son obligatorias):

```text
Negocio,Telefono,Pagina web,Direccion,Estado,Descripcion,Ultimo contacto,URL Google Maps
```

Los estados aceptan tanto el nombre visible (`Por contactar`, `Cliente`) como la clave interna (`contact`, `client`).

## Dónde viven los datos

La base no es un TXT dentro de esta carpeta. Se guarda en el perfil del navegador, en el espacio privado de la extensión. Esto evita que una recarga o actualización de Google Maps borre los datos. Para moverla a otro equipo o perfil, usa **Respaldo JSON** y después **Importar**.

El CSV es el puente recomendado hacia Excel/Google Sheets:

1. Exporta el CSV.
2. Ábrelo directamente con Excel, o en Google Sheets usa **Archivo → Importar → Subir**.
3. Después de editar fuera de la extensión, vuelve a exportar como CSV UTF-8 e impórtalo.

## Limitaciones conocidas

- Google Maps es una aplicación que cambia su estructura interna con frecuencia. La extensión usa varias señales y selectores alternativos, pero una actualización grande de Maps podría exigir ajustar `content.js`.
- Cuando Google Maps expone un marcador como elemento accesible, la insignia de estado se adhiere directamente a él. En los demás casos se usa una capa proyectada que se oculta mientras mueves o amplías el mapa y se recalcula al terminar. Los registros antiguos sin coordenadas solo pueden colorearse cuando Maps expone su marcador o resultado en pantalla.
- La sincronización de listas depende de la interfaz de Google Maps y de que hayas iniciado sesión. No se activa sola: ocurre únicamente cuando pulsas **Guardar negocio** y mantienes marcada la opción de sincronización.
- Una extensión sin la API oficial de Google Maps no puede recorrer automáticamente todos los negocios ni obtener datos que Google Maps no haya mostrado en la ficha seleccionada.
- La versión inicial no sincroniza en tiempo real con Google Sheets. Hacerlo requeriría OAuth, permisos sobre una cuenta y una configuración de Google Cloud. Para uso personal, CSV/JSON es más simple y fácil de respaldar.
- Si Google Maps ya estaba abierto durante la instalación o actualización de la extensión, recarga esa pestaña una vez.

## Estructura

```text
manifest.json       Configuración Manifest V3
background.js       Botón de activación y apertura de la base
content.js          Integración y ficha flotante en Google Maps
map-markers.css     Etiquetas de estado dentro de los resultados
dashboard.html      Vista completa de la base comercial
dashboard.css       Diseño de la vista de tabla
dashboard.js        CRUD, filtros, importación y exportación
```

## Privacidad

La extensión no envía datos a terceros. Solo solicita permiso de almacenamiento y acceso a las páginas de Google Maps declaradas en `manifest.json`. Toda la información comercial queda en el perfil local del navegador hasta que tú la exportes o la elimines.
