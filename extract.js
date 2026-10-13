import { TOOL, SYSTEM, userPrompt } from './_schema.js';

export const config = { maxDuration: 120 };

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const SB = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_ANON_KEY;
  if (!SB || !KEY || !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server is missing SUPABASE_URL, SUPABASE_ANON_KEY or ANTHROPIC_API_KEY.' });

  // Only signed-in users can spend API credits.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const who = await fetch(`${SB}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: KEY } });
  if (!who.ok) return res.status(401).json({ error: 'Please sign in again.' });
  const user = await who.json();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const files = (body.files || []).slice(0, 20);
  const texts = (body.texts || []).slice(0, 20);
  if (!files.length && !texts.length) return res.status(400).json({ error: 'No documents provided.' });

  const content = [];
  for (const f of files) {
    if (!f.path || !f.path.startsWith(user.id + '/')) return res.status(403).json({ error: 'File does not belong to this account.' });
    const url = `${SB}/storage/v1/object/authenticated/documents/${f.path.split('/').map(encodeURIComponent).join('/')}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: KEY } });
    if (!r.ok) return res.status(400).json({ error: `Could not read ${f.name} from storage.` });
    const data = Buffer.from(await r.arrayBuffer()).toString('base64');
    content.push({ type: 'text', text: `File: ${f.name}` });
    if (f.mediaType === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
    else if (IMAGE_TYPES.includes(f.mediaType)) content.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data } });
  }
  for (const t of texts) content.push({ type: 'text', text: `File: ${t.name}\n${String(t.text || '').slice(0, 300000)}` });
  content.push({ type: 'text', text: userPrompt(body.retailer, body.season) });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000, system: SYSTEM,
      tools: [TOOL], tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'Extraction failed.' });
  const out = (j.content || []).find((c) => c.type === 'tool_use');
  if (!out) return res.status(502).json({ error: 'The model did not return structured data.' });
  return res.status(200).json(out.input);
}
