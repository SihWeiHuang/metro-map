# Metro Map

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Create local env file

```bash
cp .env.example .env
```

3. Fill in your Mapbox token in `.env`

```env
VITE_MAPBOX_TOKEN=your_mapbox_public_token
```

4. Run development server

```bash
npm run dev
```

5. Commit and push changes to GitHub

Stage all changes, create a commit, and push to the remote in one command. Replace the message with a short description of your changes:

```bash
git add -A && git commit -m "你的提交說明" && git push
```

If this branch has no upstream yet, use:

```bash
git add -A && git commit -m "你的提交說明" && git push -u origin HEAD
```

## Deploy to Vercel (GitHub Auto Deploy)

- This project reads `VITE_MAPBOX_TOKEN` from environment variables.
- In Vercel Project Settings -> Environment Variables, add:
  - Name: `VITE_MAPBOX_TOKEN`
  - Value: your Mapbox public token
  - Environments: `Production`, `Preview`, and `Development` (recommended)

Without this variable, the map will not load correctly.
