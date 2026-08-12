# Desktop OAuth setup — what you need to do

The desktop app can't run Google sign-in against its own local server (random
loopback port, unknown to Google/Supabase). It now opens a page on the
deployed site instead, then hands the session back to the app over a
`luman://` deep link. Two things need to exist outside the code for this to
work.

## 1. Supabase redirect URL

Go to **Supabase Dashboard → your project → Authentication → URL
Configuration → Redirect URLs** and add:

```
https://lumanv1.vercel.app/auth/callback
```

Keep any existing entries (e.g. `http://localhost:3000/auth/callback`) —
just add this one alongside them.

## 2. Google OAuth client (only if you use a custom client)

If Authentication → Providers → Google in Supabase uses **Supabase's shared
OAuth client** (no Client ID/Secret filled in), skip this — nothing to do,
Supabase's own callback URL already covers it.

If you filled in your **own** Google Cloud OAuth Client ID/Secret, go to
**Google Cloud Console → APIs & Services → Credentials → your OAuth client →
Authorized redirect URIs** and confirm this is present:

```
https://gforvlhxweintgjjyukq.supabase.co/auth/v1/callback
```

(This is Supabase's own callback, not the Vercel URL — it should already be
there from initial setup. Nothing new to add for the desktop flow itself.)

## 3. Redeploy after any code change

Whenever the app code changes (new pages, fixes to the OAuth flow, etc.), the
live copy at `lumanv1.vercel.app` needs a fresh deploy or it'll keep serving
the old version:

```
cd d:/codings/lumanv1
vercel deploy --prod
```

## Already done for you

- Deployed to `https://lumanv1.vercel.app` (linked Vercel project:
  `debapallabs-projects/lumanv1`)
- Set on Vercel (production env): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SITE_URL=https://lumanv1.vercel.app`
- Updated local `.env.local` to match `NEXT_PUBLIC_SITE_URL`
- Removed `ELECTRON_RUN_AS_NODE=1` from your Windows user environment — it
  was silently breaking every Electron launch, including the `luman://`
  deep-link handoff after sign-in. **Close and reopen any terminals** so
  they stop inheriting the old value.

## Quick test once step 1 is done

1. Tell me to redeploy (`vercel deploy --prod`) so `/auth/desktop-login`
   (the new browser-side sign-in page) goes live.
2. Relaunch the desktop app.
3. Click "Continue with Google" — it should open your real browser at
   `lumanv1.vercel.app`, run Google sign-in, then bounce back to the Luman
   app window automatically.
