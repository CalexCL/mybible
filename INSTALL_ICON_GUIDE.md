# MyBible Desktop / PWA Icon Patch

Selected design: **No. 4 — myBible + dove + cross + open Bible**

This patch prepares the selected image for:
- Windows desktop shortcuts / `.ico`
- Chrome / Edge installed web-app icon
- Android/PWA launcher icon
- Maskable launcher icon
- Browser favicon
- Apple touch icon

## Files created

- `icons/mybible.ico`
- `icons/icon-16.png` through `icons/icon-512.png`
- `icons/icon-maskable-192.png`
- `icons/icon-maskable-512.png`
- `icons/apple-touch-icon.png`
- `manifest.webmanifest`
- `pwa.js`
- `service-worker.js`
- `APPLY_ICON_PATCH.bat`
- `APPLY_ICON_PATCH.ps1`

## Apply to your GitHub working folder

Working folder previously recorded:

`C:\Users\trade\OneDrive\Desktop\Chatgpt\mybible-github`

1. Extract/copy **all contents of this patch ZIP** into that folder.
2. Allow Windows to replace `manifest.webmanifest`.
3. Double-click `APPLY_ICON_PATCH.bat`.
4. Then in Command Prompt:

```bat
cd C:\Users\trade\OneDrive\Desktop\Chatgpt\mybible-github
git status
git add .
git commit -m "Add MyBible desktop installation icon and PWA support"
git push origin main
```

## Install MyBible after GitHub Pages redeploys

Open:

`https://calexcl.github.io/mybible/`

in Chrome or Microsoft Edge.

You can install using either:
- the browser's **Install app** icon, or
- the new **⇩** MyBible install button when the browser exposes installation.

The installed desktop app uses the selected No. 4 icon and launches in a standalone app window.

## Windows ICO

If you later build a native Windows installer/EXE, use:

`icons\mybible.ico`