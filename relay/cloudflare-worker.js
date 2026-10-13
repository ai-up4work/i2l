// relay/cloudflare-worker.js
//
// Tiny relay for sellers whose firewall blocks Vercel's datacenter IPs.
// Deploy it as a Cloudflare Worker, then set these on Vercel:
//   STORE_PROXY_URL    = https://<your-worker>.workers.dev
//   STORE_PROXY_SECRET = same value as the PROXY_SECRET worker secret
//   STORE_PROXY_HOSTS  = otakuclothingsl.store,other-seller.com   (or *)
//
// Worker settings:
//   Secret:   PROXY_SECRET   (long random string)
//   Variable: ALLOWED_HOSTS  (comma list of seller hostnames; REQUIRED so
//                             this can't be used as an open proxy)

export default {
  async fetch(request, env) {
    if (request.headers.get('x-proxy-secret') !== env.PROXY_SECRET) {
      return new Response('forbidden', { status: 403 });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('missing url', { status: 400 });

    let url;
    try {
      url = new URL(target);
    } catch {
      return new Response('bad url', { status: 400 });
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return new Response('bad protocol', { status: 400 });
    }

    const allowed = (env.ALLOWED_HOSTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.length || !allowed.includes(url.hostname)) {
      return new Response('host not allowed', { status: 403 });
    }

    const headers = new Headers(request.headers);
    for (const h of [
      'x-proxy-secret',
      'host',
      'cf-connecting-ip',
      'cf-ray',
      'cf-visitor',
      'cf-ipcountry',
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-real-ip',
    ]) {
      headers.delete(h);
    }

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'follow',
    });

    // Pass the response straight back (status, headers incl. x-wp-total).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
};