import { Router } from '../src/router.js';
import { registerApiRoutes } from '../src/routes/api.js';
import { connectMongo } from '../src/config/mongo.js';
import '../src/db.js';

const router = new Router();
registerApiRoutes(router);

export default async function handler(req, res) {
  // If MongoDB URI is set in Vercel environment variables, connect
  if (process.env.MONGODB_URI) {
    await connectMongo();
  }

  const handled = await router.handle(req, res);
  if (!handled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }
}
