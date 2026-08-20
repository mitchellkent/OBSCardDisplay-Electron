# OBS Card Display Controller

A compact Electron app for streamers and content creators. It lets you browse a folder of images on your machine and push them into OBS Studio as an on-screen source using websockets.

## Purpose

The app solves a niche streaming need: reveal a card, image, or graphic through OBS to inform viewers when a card or ability is used.

## Features

- **OBS WebSocket connection** — connect to OBS Studio with an address and optional password.
- **Image folder browser** — recursively loads PNG, JPEG, JPG, and TIFF images from any folder.
- **Search/filter** — filter the loaded images by filename or path.
- **Image selection** — click a thumbnail to select it.
- **Three display modes**:
  - **Show Timed** — fade the image in, hold it for a configurable duration, then fade it out.
  - **Show Indefinite** — fade the image in and keep it visible.
  - **Hide** — fade the image to transparent.
- **Configurable timing** — display duration and fade duration are editable and persisted.
- **Smooth fading** — uses an OBS Color Correction opacity filter, with fallback for older filter versions.
- **Position/size preservation** — the app only sets the source position and scale once, so manual adjustments in OBS are not overwritten.
- **Persistent settings** — OBS address, timing values, theme, and default transform settings are saved between sessions.
- **Light/dark theme** — toggle between light and dark mode; choice is remembered.

## Main Technical Implementation

- **Electron main process** (`main.js`)
  - Handles the application window, file-system dialogs, recursive image scanning, and a small `settings.json` persistence layer in the user's data directory.
  - Exposes `select-folder`, `scan-folder`, `get-settings`, `save-settings`, and `show-alert` via `ipcMain`.

- **Renderer process** (`src/index.js`)
  - Uses `obs-websocket-js` v5 to communicate with OBS.
  - Manages a fixed image source named `CardDisplay_Source` in the currently active OBS scene.
  - Creates/updates the source, applies an opacity filter named `CardDisplayOpacity` (`color_filter_v2` with `color_filter` fallback), and animates opacity in the renderer process with stepped `SetSourceFilterSettings` calls.
  - Tracks the currently displayed image and its opacity so repeated clicks on the same image fade from the existing state.

- **UI/UX** (`src/index.html` and `src/index.css`)
  - Plain HTML/CSS/JS, compact single-page layout.
  - Merged image browser and display controls to reduce scrolling.
  - Thumbnail grid with selection, search, and status feedback.
  - Dark mode via `body.dark-mode` class overrides.

## Running the App

```bash
npm install
npm run start
```

## OBS Requirements

- OBS Studio with the **WebSocket Server** enabled (OBS WebSocket v5).
- A scene active in OBS; the app will create/manage the `CardDisplay_Source` image source in that current scene.
