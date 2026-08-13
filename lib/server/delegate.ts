import { createSupabaseServerClient, getBearerToken } from "@/lib/supabase/server";

/**
 * Delegation: how the desktop app runs secret-requiring routes without ever
 * holding the secret.
 *
 * The desktop build embeds a full Next.js server, so `app/api/**` executes on
 * the user's machine. A handful of those routes need credentials that must
 * never leave your infrastructure — the Supabase service-role key (bypasses
 * every RLS rule), the OpenRouter/OpenAI keys (billable), the Blob token
 * (writable storage). Shipping any of them inside an installer is equivalent
 * to publishing them: an Electron package is an archive, not a vault.
 *
 * So those routes ask this module first. When the required secret is present
 * in `process.env` — which is true on Vercel and false on every user machine —
 * the route runs locally, exactly as it always has. When it is absent, the
 * request is forwarded verbatim to the deployed backend, carrying the caller's
 * own Supabase access token as proof of identity. The deployed route then runs
 * with the secret it already has, under the same user, and its response is
 * streamed straight back.
 *
 * Net effect: identical behaviour to a user, zero secrets on their disk, and
 * one code path serving both web and desktop.
 *
 * Deliberately NOT a generic proxy: `delegateIfSecretMissing` is called
 * explicitly at the top of each route that needs it, so the set of delegated
 * routes is greppable rather than implicit in middleware.
 */

/**
 * Marks a request as already delegated. If the deployed backend is itself
 * missing the secret, it must fail with its own error rather than forward the
 * request onward — otherwise a misconfigured Vercel deployment would proxy to
 * itself until something times out.
 */
const DELEGATION_MARKER = "x-luman-delegated";

/**
 * Request headers worth carrying upstream. An allowlist rather than a
 * blocklist: `host`, `cookie`, `connection`, `content-length` and friends
 * either belong to the local hop or are re-derived by `fetch`, and forwarding
 * them causes subtle, hard-to-diagnose failures.
 */
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "x-vercel-filename"];

/**
 * Response headers that describe the upstream transport rather than the
 * payload. `fetch` has already decoded the body, so re-advertising the
 * original encoding or length would describe bytes we are no longer sending.
 * `set-cookie` is dropped because the deployed origin must never write
 * cookies into the desktop window's jar — the desktop session is installed
 * once, over the `luman://` handoff, and nothing else should touch it.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "set-cookie",
]);

/** The deployed origin this build talks to, or null if none is configured. */
export function resolveBackendOrigin(): string | null {
  const raw = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    // Reject anything that is not an absolute http(s) origin rather than
    // building a request URL that silently resolves somewhere unexpected.
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** The token to prove who the caller is: an explicit bearer, else the cookie session. */
async function resolveAccessToken(): Promise<string | null> {
  const bearerToken = await getBearerToken();
  if (bearerToken) return bearerToken;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Run this route against the deployed backend instead of locally, when the
 * secret it needs is not on this machine.
 *
 * Returns the upstream `Response` when the request was delegated, or `null`
 * when the caller should proceed with its own logic. The request body is only
 * read in the delegating branch, so a `null` result leaves it intact for the
 * route to consume.
 *
 * @param req            The incoming request.
 * @param requiredEnvKeys Env vars the local handler cannot work without.
 */
export async function delegateIfSecretMissing(req: Request, requiredEnvKeys: string[]): Promise<Response | null> {
  const hasEverySecret = requiredEnvKeys.every((key) => Boolean(process.env[key]));
  if (hasEverySecret) return null;

  // Already forwarded once — this IS the backend. Fail locally.
  if (req.headers.get(DELEGATION_MARKER)) return null;

  // Vercel sets this on every deployment, including previews. The deployed
  // backend is the end of the line: if a secret is missing there it is a
  // configuration mistake to surface, not one to paper over by borrowing
  // another deployment's credentials.
  if (process.env.VERCEL) return null;

  const backendOrigin = resolveBackendOrigin();
  if (!backendOrigin) return null;

  const requestUrl = new URL(req.url);

  // Guard against a deployment delegating to itself when a secret is simply
  // missing from its own environment.
  try {
    if (new URL(backendOrigin).host === requestUrl.host) return null;
  } catch {
    return null;
  }

  const target = `${backendOrigin}${requestUrl.pathname}${requestUrl.search}`;

  const outboundHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) outboundHeaders.set(name, value);
  }
  outboundHeaders.set(DELEGATION_MARKER, "1");

  const accessToken = await resolveAccessToken();
  if (accessToken) outboundHeaders.set("authorization", `Bearer ${accessToken}`);

  // The body is buffered rather than streamed: a streamed request body needs
  // `duplex: 'half'`, which is not uniformly supported across the Node and
  // edge runtimes this app builds for, and buffering restores a real
  // `content-length` that a chunked upload would otherwise lose (/api/upload
  // reads it to enforce its size limit). Bodies here are chat/generate JSON or
  // a single user-picked file, both already bounded.
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: outboundHeaders,
      body,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    // A delegated route is useless without the network, and saying so plainly
    // beats the generic 500 the caller would otherwise surface.
    console.error(`[delegate] ${req.method} ${requestUrl.pathname} -> ${backendOrigin} failed:`, err);
    return new Response(
      JSON.stringify({
        error: "Could not reach the Luman service. Check your internet connection and try again.",
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
