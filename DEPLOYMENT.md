# Deployment Guide

## GitHub Setup

1. **Authenticate GitHub CLI** (required for pushing):
   ```bash
   gh auth login
   ```
   Follow the prompts to log in (browser or token).

2. **Create repo and push**:
   ```bash
   gh repo create bizzi-cloud --public --source=. --remote=origin --push --description "Cloud storage for creators - sync Bizzi Byte or any drive to Firebase"
   ```
   Or, if the repo already exists on GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/bizzi-cloud.git
   git push -u origin main
   ```

## Vercel Deployment

1. **Connect GitHub** to Vercel at [vercel.com](https://vercel.com)
2. **Import** the `bizzi-cloud` repository
3. **Add Environment Variables** in Vercel project settings:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

4. **Deploy** – Vercel will build and deploy on every push to main.

## Firebase Setup (before first deploy)

1. **Deploy Firestore rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Storage rules**:
   ```bash
   firebase deploy --only storage
   ```

3. **Deploy Firestore indexes** (when prompted by console, or proactively):
   ```bash
   firebase deploy --only firestore:indexes
   ```
