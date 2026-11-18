// AI invoice extraction (Spec 9.2). Assistant only: a human confirms every value before it is saved.
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

const PROMPT = `You read Indian plastic-packaging purchase invoices for EPR (Extended Producer Responsibility) compliance.
Return ONLY a JSON object, no prose and no code fences, with exactly this shape:
{
  "invoice_number": string,
  "invoice_date": "YYYY-MM-DD",
  "seller_name": string,
  "buyer_name": string,
  "items": [
    {
      "description": string,
      "packaging_type": string,
      "quantity_value": number,
      "unit": "kg" | "tonne",
      "quantity_tonnes": number,
      "category_suggestion": "I" | "II" | "III" | "IV",
      "confidence": number between 0 and 1
    }
  ],
  "notes": string
}
Packaging categories under India's Plastic Waste Management Rules:
I = rigid plastic packaging (bottles, jars, tubs, trays, caps)
II = flexible plastic packaging of single layer or multilayer of the same polymer (pouches, films, carry bags, shrink wrap)
III = multi-layered plastic packaging (at least one layer of plastic plus at least one layer of non-plastic material, e.g. laminated sachets, foil laminates)
IV = plastic sheet or like materials used for packaging and carry bags made of compostable plastics.
Include only plastic packaging line items. Convert kg to tonnes by dividing by 1000. Use a lower confidence when the category or quantity is ambiguous, and explain any doubt in notes. If a field is missing write an empty string.`;

export function stripFences(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return t;
}

/** Normalise an extraction: kg -> tonnes, clamp confidence, valid categories. */
export function normalizeExtraction(raw, categories = ['I', 'II', 'III', 'IV']) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    invoice_number: String(raw?.invoice_number ?? ''),
    invoice_date: String(raw?.invoice_date ?? '').slice(0, 10),
    seller_name: String(raw?.seller_name ?? ''),
    buyer_name: String(raw?.buyer_name ?? ''),
    items: items.map((it) => {
      const value = Number(it.quantity_value ?? it.quantity_tonnes ?? 0) || 0;
      const statedTonnes = Number(it.quantity_tonnes);
      // Trust the unit label, but if the model's own tonnes figure is value / 1000, the value is in kg
      // (models sometimes mislabel "28,000 KG" as tonnes).
      const looksKg = value > 0 && Number.isFinite(statedTonnes) && statedTonnes > 0 && Math.abs(statedTonnes * 1000 - value) / value < 0.01;
      const unit = /^k/i.test(String(it.unit || '')) || looksKg ? 'kg' : 'tonne';
      const tonnes = unit === 'kg' ? value / 1000 : value;
      const cat = String(it.category_suggestion || '').toUpperCase().replace('CATEGORY', '').trim();
      return {
        description: String(it.description ?? ''),
        packaging_type: String(it.packaging_type ?? ''),
        quantity_value: value,
        unit,
        quantity_tonnes: Math.round(tonnes * 1000) / 1000,
        category_suggestion: categories.includes(cat) ? cat : categories[0],
        confidence: Math.max(0, Math.min(1, Number(it.confidence ?? 0.5))),
      };
    }),
    notes: String(raw?.notes ?? ''),
  };
}

const MEDIA = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.gemini_api_key || '';
const anthropicConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export function aiProvider() {
  if (geminiKey()) return 'gemini';
  if (anthropicConfigured()) return 'claude';
  return null;
}

export function aiConfigured() {
  return !!aiProvider();
}

/** Calls the configured vision LLM with the invoice file. Throws on any failure so the caller can fall back. */
export async function extractWithAI(filePath, originalName) {
  const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  const mediaType = MEDIA[ext];
  if (!mediaType) throw new Error(`Unsupported file type ${ext || '(none)'} for AI extraction`);
  const data = fs.readFileSync(filePath).toString('base64');
  if (aiProvider() === 'gemini') return extractWithGemini(data, mediaType);
  return extractWithClaude(data, mediaType);
}

// Gemini via REST (no SDK dependency). Override with GEMINI_MODEL; otherwise fast "lite" models first,
// moving on to the next model when one is unknown, overloaded (429/503) or slow.
const GEMINI_MODELS = () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash']);
const RETRYABLE = new Set([400, 404, 429, 500, 503, 504]);

async function extractWithGemini(data, mediaType) {
  const tried = [];
  for (const model of GEMINI_MODELS()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let res;
    let body;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data } }, { text: PROMPT }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      });
      body = await res.json().catch(() => ({}));
    } catch (e) {
      tried.push(`${model}: ${e.name === 'AbortError' ? 'timed out' : 'network error'}`);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      tried.push(`${model}: ${res.status === 503 ? 'busy' : res.status}`);
      if (RETRYABLE.has(res.status)) continue;
      throw new Error(`Gemini error: ${body?.error?.message || res.status}`);
    }
    const cand = body.candidates?.[0];
    if (!cand || cand.finishReason === 'SAFETY') throw new Error('The AI declined to read this file');
    const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
    try {
      return normalizeExtraction(JSON.parse(stripFences(text)));
    } catch {
      throw new Error('AI response was not valid JSON');
    }
  }
  throw new Error(`Gemini is unavailable right now (${tried.join('; ')})`);
}

async function extractWithClaude(data, mediaType) {
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };

  const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to read this file');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error('AI response was not valid JSON');
  }
  return normalizeExtraction(parsed);
}
