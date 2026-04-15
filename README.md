# El Jimador x La Solar — Rhythm Game HTML5

Proyecto HTML5 **rhythm game** para instalación física de evento.

Ahora incluye una versión más aterrizada para instalación real:

- interacción optimizada para **pies**
- **3 carriles por jugador**
- zonas de impacto grandes y legibles
- selector de **MP3 local** desde el launcher
- generación de notas **reactivas a la música** usando Web Audio API
- fondo de gameplay separado en `/assets/backgrounds`
- modo de **calibración visual** para zonas de sensor
- UI con **safe areas** para evitar desbordes

## Qué incluye

- Juego HTML5 responsive con 2 jugadores simultáneos
- Estados de:
  - inicio
  - countdown
  - gameplay
  - resultados / ganador
- Launcher / panel operador
- Modo **mouse / touch test**
- Estructura lista para conectar **LidarTouch M1**
- Assets exportados en PNG con transparencia
- Código modular en HTML, CSS y JavaScript
- Operación local sin backend obligatorio
- Carpeta con **arte fuente original** incluido para referencia

## Estructura del proyecto

```text
/index.html
/css
/js
/assets
  /backgrounds
  /sprites
  /ui
  /logos
  /effects
/scripts
/source_art
README.md
```

## Cómo correrlo

### Opción recomendada
Usa un servidor local simple:

```bash
python -m http.server 8000
```

Luego abre:

```text
http://localhost:8000
```

## Flujo de uso

1. Abre `index.html`
2. Haz clic en **Abrir setup 2 pantallas**
3. Se abrirán:
   - una ventana `?screen=floor` + las session - esta sale en el launcher
   - una ventana `?screen=wall` + las session - esta sale en el launcher
4. Desde el launcher puedes:
   - iniciar ronda
   - reiniciar
   - cambiar entre **mouse** y **sensor**
   - cargar un **MP3 local**
   - activar **calibración visual**
   - revisar estado de conexión

> Si el navegador bloquea popups, habilítalos para el sitio local y vuelve a intentar.

## Controles modo test

### Player 1
- Teclado: `A S D`
- Mouse / touch: click o toque sobre el pad correspondiente - `funciona a medias`

### Player 2
- Teclado: `J K L`
- Mouse / touch: click o toque sobre el pad correspondiente - `funciona a medias`

### Start / restart
- `SPACE` inicia una nueva ronda desde la pantalla de piso
- desde el launcher también puedes iniciarla - `Ya no funciona`

## MP3 reactivo

El launcher permite seleccionar un archivo MP3 local. `Ya funciona`

Qué hace:

- carga el audio en la pantalla de piso ✅
- analiza energía / picos del track ✅
- genera un chart de notas reactivo a la música  `funciona a medias`
- usa la duración del track como duración real de la ronda ✅ se puede limitar
  

### Nota
El chart es **generado automáticamente** a partir del audio. No es un beatmap manual frame-perfect, pero sí es bastante más coherente que una lluvia aleatoria de notas.



## Modo sensor / LidarTouch M1 - EXPERIMENTAL - ALPHA - SE USO TABLET COMO RECURSO "TOUCH"

El punto de integración queda listo en `js/floor-screen.js`. ✅

### Hook principal expuesto
```js
window.LidarTouchBridge.hit(player, lane) ✅
```

Ejemplo:
```js
window.LidarTouchBridge.hit(1, 0); // Player 1, lane 0 ✅
window.LidarTouchBridge.hit(2, 2); // Player 2, lane 2 ❌❓
```

### Evento alternativo soportado
```js
window.dispatchEvent(new CustomEvent("lidar-hit", {
  detail: { player: 1, lane: 2 }
})); ❌✅❓
```

### Calibración visual
```js
window.LidarTouchBridge.setCalibrationMode(true) ❌✅❓
```

### Ajuste simple de zonas
```js
window.LidarTouchBridge.configureZones({ ❌❓
  centerGap: 1.05,
  padHeight: 1.1,
  safeTop: 1,
  safeBottom: 1
});
```

## Dónde adaptar la entrada real del sensor

### Archivo
`js/floor-screen.js` ✅

### Puntos clave
- método `externalHit(player, lane)` 
- listener del evento `"lidar-hit"`
- objeto global `window.LidarTouchBridge`
- overlay de calibración y layout de carriles en `getLaneLayout()`

## Sincronización entre pantallas

La sincronización usa:

- `postMessage` entre ventanas abiertas desde el launcher ✅
- `BroadcastChannel` como respaldo cuando el navegador lo permite ✅

Esto permite montar el juego localmente sin servidor complejo ni middleware adicional.

## Assets destacados

- `assets/backgrounds/start_screen_full.png` ✅
- `assets/backgrounds/results_screen_full.png` ✅
- `assets/backgrounds/floor_gameplay_bg.png` ✅
- `assets/backgrounds/wall_gameplay_bg.png` ✅

## Archivos fuente incluidos

En `/source_art` quedan copias del material original recibido:

- `JUEGO_LA_SOLAR_GAME copia(3).pdf`
- `JUEGO_LA_SOLAR_GAME(3).ai`

## Mejoras siguientes recomendadas

- beatmaps manuales por canción
- bridge nativo / WebSocket real para sensor
- calibración editable con drag & drop
- selección de playlists
- ranking persistente por sesiones

Básicamente: ya no está en modo “demo genérica”, sino mucho más cerca de “instalación que sí entiende que la gente va a jugar con los pies”.
