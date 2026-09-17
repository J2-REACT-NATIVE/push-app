# Guía de push notifications: build, Firebase y pruebas

Guía operativa para levantar esta app desde una máquina nueva y probar el flujo completo de notificaciones push en Android (emulador o dispositivo) y en iOS (simulador o iPhone por USB).

Expo SDK 54 · React Native 0.81 · expo-router v6 · New Architecture.

---

## 1. Qué hace esta app y cómo viaja una push

La app tiene un solo propósito: recibir una push de Expo y abrir la pantalla de chat que venga en el payload.

```
app          →  getExpoPushTokenAsync()      obtiene ExponentPushToken[...]
backend      →  exp.host/--/api/v2/push/send envía usando ese token
exp.host     →  FCM v1 (Android) / APNs (iOS)
dispositivo  →  hooks/use-push-notifications.ts
             →  router.push('/chat/<chatId>')
```

Toda la lógica vive en un archivo: **`hooks/use-push-notifications.ts`**. Es lo primero que hay que leer.

El payload **debe** llevar `chatId` dentro de `data`:

```json
{ "to": "ExponentPushToken[...]", "title": "...", "body": "...", "data": { "chatId": "123" } }
```

Cualquier otra forma se ignora: la notificación llega, pero no hay deep link. La pantalla destino es `app/chat/[id].tsx`.

La navegación está diferida a propósito: un efecto espera a que exista `useRootNavigationState().key` antes de llamar a `router.push`. Navegar antes de que monte el navegador raíz lanza excepción, así que esa guarda no se quita.

---

## 2. Requisitos previos (máquina nueva)

### Común

**Node 20 LTS** (probado con v20.20.2). Luego, en la raíz del repo:

```bash
npm install
```

npm 11.19 bloquea los install scripts hasta que se aprueban. Verás este aviso:

```
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts
```

Apruébalos:

```bash
npm install-scripts approve fsevents unrs-resolver
npm install
```

Son legítimos y parte del toolchain: `fsevents` es el watcher nativo de macOS que usa Metro (sin él cae a polling, más lento), y `unrs-resolver` es el binding nativo del resolver de imports de `eslint-config-expo` (sin su postinstall, `npm run lint` falla con `Cannot find module @unrs/resolver-binding-darwin-x64`). La aprobación queda registrada en `allowScripts` de `package.json`.

**EAS CLI** y cuenta Expo con acceso al owner `j2systems`:

```bash
npm install -g eas-cli
eas login
eas whoami
```

### Android

- **JDK 17** (probado con Zulu 17). Verifica con `java -version`.
- **Android Studio** con el SDK y `platform-tools`. En `~/.zshrc`:

  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
  ```

- **Un AVD con imagen Google APIs o Google Play.** Esto no es opcional: FCM se entrega a través de Google Play services, y una imagen AOSP **nunca** recibirá una push. En Device Manager elige una imagen cuyo tag sea `google_apis` o `google_apis_playstore`.

  El entorno de referencia usa `Pixel_9_Pro_XL_2026`, imagen `google_apis`, Android 35, x86_64.

  Para comprobar la imagen de un AVD existente:

  ```bash
  grep -E "tag.id|image.sysdir" ~/.android/avd/<NOMBRE>.avd/config.ini
  ```

### iOS (solo macOS)

- **Xcode** (probado con 26.4.1) y sus command line tools.
- **CocoaPods** (probado con 1.17.0): `sudo gem install cocoapods` o vía Homebrew.
- Para dispositivo físico: cuenta Apple añadida en Xcode → Settings → Accounts.

---

## 3. Firebase: qué es cada archivo

Android no permite que nadie entregue una push por su cuenta. El único canal es **FCM (Firebase Cloud Messaging)**. Expo no lo reemplaza: es una capa encima que traduce tu `ExponentPushToken` y llama a FCM por ti.

Por eso hay **dos archivos de Firebase con papeles opuestos**:

| archivo | dónde vive | para qué sirve |
|---|---|---|
| `google-services.json` | raíz del repo; el prebuild lo copia a `android/app/` | identifica tu app **ante** FCM: `project_number`, package name, api_key. Va dentro del APK. Sin él la app no se registra y no hay token |
| `push-firebase-config.json` | subido a EAS, **nunca** al APK | service account key que autoriza a los servidores de Expo a llamar la API FCM v1 en nombre de tu proyecto. Sin él, el envío responde `InvalidCredentials` |

Uno es el lado que **recibe**, el otro el lado que **envía**.

Proyecto Firebase de esta app: **`pushnotifications-89591`**.

### Obtener `google-services.json`

1. [Firebase Console](https://console.firebase.google.com/) → proyecto `pushnotifications-89591`.
2. Configuración del proyecto → Tus apps → añadir o abrir la app **Android**.
3. El *nombre del paquete* debe ser exactamente **`com.j2systems.app`**, igual que `android.package` en `app.json`. Si no coincide, la app no se registra en FCM.
4. Descargar `google-services.json` y dejarlo en la raíz del repo.

### Obtener la service account key

1. Firebase Console → Configuración del proyecto → **Cuentas de servicio**.
2. *Generar nueva clave privada* → descarga un `.json`.
3. Guardarlo en la raíz como `push-firebase-config.json`.

`push-firebase-config.template` es el placeholder versionado: muestra la forma del archivo con los campos sensibles vacíos.

### Seguridad

Ambos archivos están en `.gitignore` y deben seguir así. No pegues su contenido en documentación, tickets ni mensajes. Si una service account key se filtra, revócala en Firebase y genera otra.

### iOS no usa Firebase

En este proyecto iOS va por **APNs directo**, con credenciales de tu cuenta Apple gestionadas por EAS. Ni `google-services.json` ni `push-firebase-config.json` intervienen en iOS.

---

## 4. Configuración del proyecto

### `app.json`

Los valores que deben coincidir entre sí:

| campo | valor | tiene que coincidir con |
|---|---|---|
| `android.package` | `com.j2systems.app` | `package_name` en `google-services.json` |
| `ios.bundleIdentifier` | `com.j2systems.app` | el App ID en Apple Developer |
| `android.googleServicesFile` | `./google-services.json` | la ruta real del archivo |
| `extra.eas.projectId` | `3296212c-570c-4e08-be81-3ca3ff01ff30` | el proyecto `@j2systems/push-app` en expo.dev |

`googleServicesFile` lo consume automáticamente el plugin por defecto del prebuild (`AndroidConfig.GoogleServices.withGoogleServicesFile`). **No** hay que añadir nada al array `plugins`.

El `projectId` es lo que lee `registerForPushNotificationsAsync()` para pedir el token:

```ts
const projectId =
  Constants?.expoConfig?.extra?.eas?.projectId ??
  Constants?.easConfig?.projectId;
```

Si falta, el registro aborta con `Project ID not found`.

Verifica el proyecto EAS con:

```bash
eas project:info
# fullName  @j2systems/push-app
# ID        3296212c-570c-4e08-be81-3ca3ff01ff30
```

### `eas.json`

Define los perfiles `development`, `preview` y `production`. Lo exige `eas credentials`, aunque los builds se hagan en local.

### Subir la credencial FCM v1 a Expo

```bash
eas login
eas credentials --platform android
```

Ruta en el menú: perfil `development` → **Google Service Account** → *Manage your Google Service Account Key for Push Notifications (FCM V1)* → *Set up a Google Service Account Key* → seleccionar `./push-firebase-config.json`.

El comando es interactivo; no existe `--non-interactive` para esta operación.

Este paso **no** hace falta para obtener el token: solo para que la push llegue de verdad. Si lo olvidas, el envío responde:

```json
{"data":{"status":"error","message":"Unable to retrieve the FCM server key for the recipient's app...","details":{"error":"InvalidCredentials"}}}
```

---

## 5. Build de Android y prueba en el emulador

### Por qué no sirve Expo Go

Desde **SDK 53**, Expo Go dejó de incluir push remoto en Android. Al abrir la app con Expo Go aparece:

> expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53. Use a development build instead of Expo Go.

No es un bug de la app. La única salida es un **development build**.

### Compilar e instalar

Con el emulador ya arrancado:

```bash
npm run android      # = expo run:android
```

Hace el prebuild (genera `android/`), compila con Gradle e instala el APK en el emulador. La primera compilación tarda varios minutos.

Si algo queda inconsistente tras cambiar `app.json`:

```bash
npx expo prebuild --clean
npm run android
```

`android/` e `ios/` están en `.gitignore`: regenerarlas no ensucia el repo.

### Sesiones siguientes

Ya instalado el build, basta arrancar Metro y abrir la app instalada (no Expo Go):

```bash
npx expo start --dev-client
```

Con caché sucia, añade `-c`.

**Si el puerto 8081 está ocupado por otro proyecto**, usa otro puerto:

```bash
npx expo start --dev-client --port 8082
adb reverse tcp:8082 tcp:8082
```

Un Metro ajeno sirviendo el bundle equivocado produce este error, que despista bastante:

```
[runtime not ready]: ReferenceError: Property 'MessageQueue' doesn't exist
```

Comprueba quién ocupa el puerto con `lsof -nP -iTCP:8081 -sTCP:LISTEN`.

**Nota sobre `npm run start:lan`**: fija la interfaz `en10` (`ipconfig getifaddr en10`). En Wi-Fi lo normal es `en0` y el script falla; para el emulador no hace falta.

### Obtener el token

Al arrancar, la app imprime el token y lo muestra en pantalla:

```bash
adb logcat -d | grep ExponentPushToken
# I ReactNativeJS: { android: 'ExponentPushToken[YG7UIaEl5ubnBE0pCxB180]' }
```

Acepta el permiso de notificaciones cuando Android lo pida (13+).

### Enviar una push de prueba

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[...]","title":"Prueba","body":"Abrir chat 123","data":{"chatId":"123"}}'
```

Respuesta esperada:

```json
{"data":{"status":"ok","id":"01a0ac01-dd9a-7219-b60c-5785dd63a7ad"}}
```

### Los tres estados a probar

**Foreground** — app abierta. Aparece el banner y la notificación entra en la lista de `app/index.tsx`.

**Background** — manda la app al home y envía la push:

```bash
adb shell input keyevent KEYCODE_HOME
# ...enviar la push...
adb shell cmd statusbar expand-notifications
```

Toca la notificación: debe abrir `/chat/123`.

**Cold start** — app terminada. Ver la sección 6: en development build **no funciona**, y es esperado.

### Comandos `adb` útiles

```bash
adb devices                                     # emuladores/dispositivos conectados
adb shell pm list packages | grep j2systems     # ¿está instalada?
adb logcat -c                                   # limpiar el log antes de una prueba
adb logcat -d | grep ReactNativeJS              # logs de JS
adb shell dumpsys notification --noredact | grep "<título>"   # ¿llegó la notificación?
adb shell cmd statusbar expand-notifications    # abrir la bandeja
adb shell am kill com.j2systems.app             # matar el proceso (ver sección 6)
adb exec-out screencap -p > /tmp/pantalla.png   # captura
adb shell dumpsys activity activities | grep -m1 topResumedActivity   # pantalla actual
```

---

## 6. Limitación conocida: cold start en development build

**Síntoma:** con la app terminada, tocar la notificación abre la app pero se queda en la pantalla índice; no navega a `/chat/<id>`.

**Causa:** es el development build, no el código. El logcat lo muestra con claridad:

```
16:11:51  START ... act=MAIN cat=[LAUNCHER] cmp=com.j2systems.app/.MainActivity (has extras)
16:11:58  START ... act=MAIN cat=[LAUNCHER] cmp=com.j2systems.app/.MainActivity        ← sin extras
```

`expo-dev-client` relanza `MainActivity` unos segundos después, con un intent limpio, y ahí se pierden los extras de la notificación con el `chatId`.

**Comprobado:** el mismo caso funciona en un build release. Para verificarlo tú mismo:

```bash
npx expo run:android --variant release --no-bundler
```

`buildTypes.release` en `android/app/build.gradle` firma con el keystore debug, así que no necesitas credenciales. Tarda bastante más que el debug porque compila las 4 ABIs. Después, para volver al development build:

```bash
adb install -r -d android/app/build/outputs/apk/debug/app-debug.apk
```

**Conclusión:** foreground y background se prueban en el development build; el cold start se verifica en release o preview. No lo persigas como bug de la app.

### Cómo simular un cold start correctamente

```bash
adb shell am kill com.j2systems.app     # correcto
adb shell am force-stop com.j2systems.app   # NO
```

`force-stop` deja la app en *stopped state* y Android **deja de entregarle FCM** hasta que el usuario la abre a mano. Las pruebas parecerán fallar cuando en realidad la push nunca llegó. `am kill` mata el proceso sin cambiar ese estado.

### Detalle del código

El hook usa `Notifications.useLastNotificationResponse()`, que se registra en `useLayoutEffect` y además se suscribe a las respuestas posteriores, cubriendo tanto el tap con la app viva como el tap que lanzó una app terminada.

No lo sustituyas por una llamada suelta a `getLastNotificationResponse()` dentro de un `useEffect`: cuando ese efecto corre, el módulo nativo todavía no registró la respuesta y devuelve `null`.

---

## 7. Build de iOS y cómo correrlo

El prebuild ya genera `ios/` con el entitlement correcto (`aps-environment: development` en `ios/pushapp/pushapp.entitlements`), puesto por el plugin `expo-notifications`.

### Simulador

```bash
npx expo run:ios
npx expo start --dev-client
```

No necesita cuenta Apple ni firma.

Para probar el deep link **sin credenciales ni red**, inyecta la push directamente en el simulador:

```bash
cat > /tmp/push.json <<'EOF'
{
  "Simulator Target Bundle": "com.j2systems.app",
  "aps": { "alert": { "title": "Prueba", "body": "Abrir chat 123" } },
  "chatId": "123"
}
EOF

xcrun simctl push booted com.j2systems.app /tmp/push.json
```

No pasa por Expo ni por APNs, pero ejercita el mismo código: `chatId` llega y dispara la navegación.

Comandos útiles:

```bash
xcrun simctl list devices available   # simuladores disponibles
xcrun devicectl list devices          # iPhones conectados por USB
```

### Dispositivo físico por USB

Antes:

1. iPhone conectado por cable y *confiar en este ordenador*.
2. **Developer Mode** activado en el iPhone: Ajustes → Privacidad y seguridad → Modo de desarrollador (iOS 16+). Requiere reiniciar.
3. Cuenta Apple añadida en Xcode → Settings → Accounts.

Luego:

```bash
npx expo run:ios --device
```

Selecciona el dispositivo por UDID, aplica firma automática (`DEVELOPMENT_TEAM`, `-allowProvisioningUpdates`, `-allowProvisioningDeviceRegistration`) e instala con `xcrun devicectl device install app`.

### Push remoto real en iOS

Necesita **Apple Developer Program de pago** (99 USD/año): la capability *Push Notifications* no existe en cuentas gratuitas. Con cuenta gratuita puedes instalar y depurar la app (perfil de 7 días), pero no obtendrás token push.

Con la cuenta lista:

```bash
eas credentials --platform ios
```

→ *Push Notifications Key*: deja que EAS genere la `.p8` o sube la tuya. Es el equivalente iOS de la service account de Firebase.

El simulador **sí** admite push remoto desde Xcode 14 / iOS 16 (macOS 13+).

### Diferencias con Android

- iOS no usa Firebase; va por APNs.
- El `ExponentPushToken` de iOS es distinto del de Android, pero el endpoint de envío es el mismo.
- El `chatId` viaja igual en `data`: el código del hook no cambia entre plataformas.

---

## 8. Solución de problemas

| Síntoma | Causa | Arreglo |
|---|---|---|
| `expo-notifications: ... removed from Expo Go with the release of SDK 53` | Estás usando Expo Go | Usa el development build: `npm run android` (sección 5) |
| `InvalidCredentials` / `Unable to retrieve the FCM server key` al enviar | La service account key no está subida al proyecto EAS | `eas credentials --platform android` → FCM V1 (sección 4) |
| `Project ID not found` | Falta `extra.eas.projectId` en `app.json` | Añádelo y compara con `eas project:info` |
| `Property 'MessageQueue' doesn't exist` | Metro de **otro** proyecto ocupando el puerto 8081 | `npx expo start --dev-client --port 8082` + `adb reverse tcp:8082 tcp:8082` |
| La push nunca llega al emulador | El AVD usa una imagen AOSP, sin Google Play services | Crea un AVD con imagen `google_apis` o `google_apis_playstore` |
| La push deja de llegar tras una prueba | La app quedó en *stopped state* por `am force-stop` | Abre la app a mano una vez; en adelante usa `am kill` |
| Cold start no navega a `/chat/<id>` | Limitación del development build | Esperado. Verifica en release (sección 6) |
| Error de FCM al pedir el token | Falta `android/app/google-services.json` o el package no coincide | Revisa `app.json` y vuelve a hacer `npx expo prebuild --clean` |
| `npm run start:lan` falla | El script fija la interfaz `en10` | Usa `npm start`, o cambia `en10` por tu interfaz activa |

---

## Referencias

- Documentación versionada de Expo SDK 54: https://docs.expo.dev/versions/v54.0.0/
- Development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Credenciales FCM: https://docs.expo.dev/push-notifications/fcm-credentials/
- `hooks/use-push-notifications.ts` — toda la lógica de push
- `app/chat/[id].tsx` — pantalla destino del deep link
- `CLAUDE.md` — resumen de arquitectura del repo
