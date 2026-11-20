import { URL } from 'node:url';

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, path, handler) {
    // Transform /api/invoices/:id to a regex
    const paramNames = [];
    const pattern = path.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${pattern}$`);

    this.routes.push({
      method: method.toUpperCase(),
      path,
      regex,
      paramNames,
      handler
    });
  }

  get(path, handler) { this.add('GET', path, handler); }
  post(path, handler) { this.add('POST', path, handler); }
  put(path, handler) { this.add('PUT', path, handler); }
  patch(path, handler) { this.add('PATCH', path, handler); }
  delete(path, handler) { this.add('DELETE', path, handler); }

  async handle(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1]);
        });

        const query = Object.fromEntries(parsedUrl.searchParams.entries());

        // Parse JSON body if present
        let body = {};
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          body = await parseBody(req);
        }

        req.params = params;
        req.query = query;
        req.body = body;

        try {
          await route.handler(req, res);
        } catch (err) {
          console.error(`Error in route ${method} ${pathname}:`, err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
          }
        }
        return true;
      }
    }

    return false; // Not matched
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({ _raw: raw });
      }
    });
    req.on('error', () => resolve({}));
  });
}
