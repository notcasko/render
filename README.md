# FGO NP Renderer

A client-side web application for downloading, parsing, skinning, and rasterizing Fate/Grand Order (FGO) Noble Phantasm 3D character and weapon models directly in the browser.

---

## Features

- **In-Browser UnityFS Unpacking**: Reads and parses binary UnityFS asset bundles client-side.
- **WASM Texture Decoding**: Decodes ASTC, ETC, Crunch, and DXT textures in the browser via WebAssembly (`texture2ddecoder`).
- **Exact Software CPU Rasterizer**: Implements the reference Python/Numba software rendering loop with back-to-front triangle depth sorting, alpha-weighted bilinear texture filtering, and Porter-Duff Over compositing.
- **32-Bit Lossless Animated PNG (APNG)**: Exports multi-frame animation sequences to high-fidelity 32-bit truecolor APNG (or 8-bit palette GIF) with zero color degradation.
- **Camera Autofocus & Transparent Trimming**: Automatically frames characters across animations and provides ImageMagick-equivalent transparent border trimming.
- **Interactive Viewport**: 60 FPS hardware-accelerated canvas panning, mouse wheel zooming, 100% pixel inspection, and fit-to-screen toggle.
- **Real-Time Streaming Logs**: Non-blocking asynchronous rasterization streaming live step progress without freezing the UI.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- `npm`

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

```bash
npm run build
```

The compiled assets will be generated in the `dist/` directory.

---

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite
- **Styling**: Tailwind CSS v4
- **Image Encoders**: `upng-js` (Lossless APNG), `gifenc` (GIF)
- **Texture Decoder**: WebAssembly (`texture2ddecoder.wasm`)
