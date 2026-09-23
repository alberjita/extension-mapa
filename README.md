# Mapa de Prospectos Locales

Extensión personal diseñada principalmente para **Opera GX** —y compatible con otros navegadores Chromium— que convierte Google Maps en un pequeño CRM visual. Al seleccionar un negocio, muestra una ficha flotante para guardar teléfono, página web, dirección, estado comercial, último contacto y notas.

Los datos se guardan localmente mediante `chrome.storage.local`. No necesita servidor, cuenta, clave de Google Maps ni conexión con una API externa. La vista **Ver base** permite buscar, filtrar, editar e importar/exportar los registros.

## Funciones incluidas

- Activación y desactivación desde el icono de la extensión.
- Detección de la ficha de negocio que esté abierta en Google Maps.
- Captura automática, cuando Maps los expone, de nombre, dirección, teléfono, web, URL y coordenadas.
- Estados con colores: sin revisar, pendiente, por contactar, contactado, interesado, cotización enviada, cliente, no interesado y no contactar.
- Etiquetas de color sobre resultados visibles que ya estén guardados y resaltado del marcador cuando Maps expone su nombre accesible.
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
5. Si Opera GX muestra la extensión dentro del menú de extensiones, usa el icono de chincheta para dejarla visible en la barra.
6. Abre o recarga Google Maps y pulsa el icono **Mapa de Prospectos Locales**.

Opera GX está basado en Chromium y esta extensión usa exclusivamente APIs `chrome.*` compatibles: `action`, `tabs`, `runtime` y `storage`. No utiliza APIs exclusivas de Google Chrome, código remoto ni dependencias externas.

## Instalación alternativa en Google Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** en la esquina superior derecha.
3. Pulsa **Cargar descomprimida**.
4. Selecciona esta carpeta.

## Uso diario

1. Abre `https://www.google.com/maps`.
2. Pulsa el icono de **Mapa de Prospectos Locales**. Aparecerá el panel flotante.
3. Busca una categoría o zona y abre un negocio.
4. Completa o corrige teléfono, web, estado y notas; luego pulsa **Guardar negocio**.
5. Usa **Ver base** para consultar todos los registros.
6. Pulsa **Exportar CSV** para analizar la base en Excel o subirla a Google Sheets.

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
- Las etiquetas y contornos de color aparecen sobre resultados o marcadores que estén cargados y que Google Maps exponga en el DOM. No son una capa geográfica independiente que pueda dibujar todos los puntos guardados a cualquier nivel de zoom.
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
