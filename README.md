# Nano Prompt Foundry

Local web app for building structured Nano Banana Pro / Nano Banana 2 prompt JSON from image references.

## Features

- Upload face, body, outfit, and scene references.
- Analyze images with APIYi Gemini vision.
- Keep scene references environment-only.
- Export nested JSON with body, outfit, scene, realism, and prompt-budget fields.
- Keep the generated prompt under a 15,000 character limit.

## Run

```powershell
$env:APIYI_API_KEY="your_apiyi_key"
npm.cmd start
```

Open:

```text
http://localhost:4173
```

The default vision provider is APIYi with `gemini-2.5-pro`.

## Build Check

```powershell
npm.cmd run build
```
