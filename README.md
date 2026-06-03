# Nano Prompt Foundry

Local web app for building structured Nano Banana Pro / Nano Banana 2 prompt JSON from image references.

## Features

- Upload face, body, outfit, and scene references.
- Analyze images with APIYi Gemini vision.
- Keep scene references environment-only.
- Export nested JSON with body, outfit, scene, realism, and prompt-budget fields.
- Keep the generated prompt under a 15,000 character limit.

## Run Locally

```powershell
$env:APIYI_API_KEY="your_apiyi_key"
npm.cmd start
```

Open:

```text
http://localhost:4173
```

The default vision provider is APIYi with `gemini-2.5-pro`.

## Deploy On Vercel

Set these environment variables in Vercel Project Settings:

```text
APIYI_API_KEY=your_apiyi_key
AI_PROVIDER=apiyi
APIYI_VISION_MODEL=gemini-2.5-pro
```

The build copies `index.html`, `styles.css`, and `app.js` into `public/`, which Vercel serves as the static site. The vision endpoints run as serverless functions at `/api/health` and `/api/analyze-image`.

## Build Check

```powershell
npm.cmd run build
```
