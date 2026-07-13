# AppCitas en Google Play (TWA con Bubblewrap)

Una **TWA (Trusted Web Activity)** empaqueta la web (que ya es una PWA
instalable: manifest + service worker + iconos incluidos en el repo) como app
Android publicable en Google Play. Sin mantener código nativo.

## Receta (≈2 h + revisión de Play)

1. Cuenta de desarrollador de Google Play (25 $ una vez):
   [play.google.com/console](https://play.google.com/console).
2. En tu máquina (Node 18+ y JDK 17):

   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://TU-DOMINIO/manifest.webmanifest
   # Acepta los valores propuestos; elige un applicationId tipo
   # com.tunegocio.appcitas y deja que genere el keystore (GUÁRDALO).
   bubblewrap build
   ```

   Produce `app-release-signed.apk` y `app-release-bundle.aab`.
3. **Verificación de dominio (assetlinks)** — imprescindible para que la app
   abra a pantalla completa sin barra de navegador:
   - Bubblewrap imprime el **SHA-256 fingerprint** del keystore
     (`bubblewrap fingerprint list` si lo necesitas después).
   - Edita `public/.well-known/assetlinks.json` en este repo: sustituye
     `package_name` por tu applicationId y el fingerprint placeholder por el
     real. Haz commit y deploy.
   - Comprueba `https://TU-DOMINIO/.well-known/assetlinks.json`.
4. Sube el `.aab` a Play Console (producción o pista interna), rellena la
   ficha (capturas, descripción, privacidad → usa `/privacidad` de la app) y
   envía a revisión.

## Notas

- La app es la web: cada deploy de la web actualiza la "app" al instante,
  sin pasar por revisión (solo cambia si tocas manifest/iconos/paquete).
- Si Google Play muestra barra de navegador al abrir, el assetlinks no
  coincide (fingerprint o package_name mal) — corrígelo y redeploya la web.
- iOS/App Store no admite TWA; el equivalente (PWA en App Store vía wrapper)
  tiene requisitos de revisión más estrictos y queda fuera de esta guía.
