import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Menu extraction endpoint via Gemini AI with rate limit resilience & backoff
  app.post('/api/extract-menu', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: 'imageBase64 is required' });
      }

      // Remove data URL prefix if present
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server' });
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are an expert restaurant menu digitization assistant.
Analyze this menu image (menu card, blackboard, price list, or flyer) and extract all food and beverage items with high accuracy.
For each item, provide:
- "name": Clean item title (e.g. "Cold Coffee", "Paneer Tikka Roll")
- "category": Logical category (e.g. "Hot Beverages", "Cold Beverages", "Combos", "Bites & Fries", "Sandwiches", "Meals", "Desserts")
- "price": Numeric price value in local currency (e.g. 150)
- "description": Brief description or ingredients if mentioned, otherwise empty string
- "isVeg": boolean (true if vegetarian, false if non-veg / chicken / mutton / egg)
- "imageEmoji": An appropriate food emoji (e.g. ☕, 🧋, 🍔, 🍟, 🥪, 🍕, 🍲, 🍰)

Return a strictly valid JSON array of these objects.`;

      // Candidate models for high throughput & rate-limit resilience
      const candidateModels = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
      let response: any = null;
      let lastError: any = null;

      for (let attempt = 0; attempt < candidateModels.length; attempt++) {
        const model = candidateModels[attempt];
        try {
          response = await ai.models.generateContent({
            model,
            contents: [
              {
                inlineData: {
                  data: cleanBase64,
                  mimeType: mimeType,
                },
              },
              prompt,
            ],
            config: {
              responseMimeType: 'application/json',
            },
          });
          if (response?.text) break;
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || '';
          const isRateLimit =
            err?.status === 429 ||
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('quota') ||
            errMsg.includes('rate limit');

          console.warn(`Attempt ${attempt + 1} with ${model} failed: ${errMsg}`);

          if (isRateLimit && attempt < candidateModels.length - 1) {
            // Wait 1.5 seconds then try fallback model
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          if (attempt === candidateModels.length - 1) {
            throw err;
          }
        }
      }

      if (!response?.text && lastError) {
        throw lastError;
      }

      const responseText = response?.text || '[]';
      let items = [];
      try {
        items = JSON.parse(responseText);
      } catch {
        // Fallback regex extraction
        const match = responseText.match(/\[[\s\S]*\]/);
        if (match) items = JSON.parse(match[0]);
      }

      return res.json({ items });
    } catch (err: any) {
      console.error('Menu extraction failed:', err);
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('quota');

      const userMessage = isRateLimit
        ? 'AI service is temporarily busy. Please wait a few seconds and try scanning again.'
        : err.message || 'Failed to extract menu from image';

      return res.status(err?.status === 429 ? 429 : 500).json({ error: userMessage });
    }
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Serve static files from public folder with correct MIME types
  app.use(
    express.static(path.resolve(__dirname, 'public'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.webmanifest') || filePath.endsWith('manifest.json')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Service-Worker-Allowed', '/');
        }
      },
    })
  );

  // Explicit PWA Manifest routes (guarantees valid JSON response on Android Chrome)
  app.get(['/manifest.json', '/manifest.webmanifest'], (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.sendFile(path.resolve(__dirname, 'public', 'manifest.json'));
  });

  // Explicit Service Worker route
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.resolve(__dirname, 'public', 'sw.js'));
  });

  // Android package download endpoint
  app.get(['/download/android', '/download/corner-cafe-pos-android.zip'], (_req, res) => {
    const zipPath = path.resolve(__dirname, 'public', 'downloads', 'corner-cafe-pos-android.zip');
    res.download(zipPath, 'CornerCafePOS-Android.zip');
  });

  // Development: Mount Vite in middleware mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve static built files from dist
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
