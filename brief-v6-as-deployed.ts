// THE BRIEF. Work out where a memory IS before asking anything, and write the
// opener for that place.
//
// IT WAS SO SLOW THE PAGE GAVE UP ON IT. On 25 Sep the browser reported "Failed
// to fetch" at 23:48:14 and the brief completed at 23:48:43 - the work was done
// and thrown away, and the customer saw a frozen screen. Three web searches plus
// a photograph plus a long prompt.
// FIXED: ONE search, no image. A brief needs to know WHAT KIND of place this is,
// and the descriptions already say. The picture is for the interview, not here.
//
// AND THE OPENER KEEPS STACKING QUESTIONS. "What were the highlights, the low
// points, and anything that went unexpectedly?" - three questions in one, and
// people answer only the last.
//
// 27 Sep - THE OCCASION PACK. A holiday gets exactly the prompt it had. Any other
// occasion gets its own care notes, words and spine, examples that fit it, and
// an opener that uses one of its avoid_words (a wedding asked about "the trip")
// is replaced by the fallback - checked in code, like the yes/no and stacked
// checks below.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const chapter = body && body.chapter_id;
  if (!chapter) return json({ error: 'no chapter_id' }, 400);
  // 27 Sep - a bare chapter id was enough to read a memory and spend on it. Now
  // only the token of the film it belongs to opens it (both pages already send it).
  const { data: owns } = await db.rpc('token_owns', { p_token: body.token || null, p_chapter: chapter });
  if (owns !== true) return json({ error: 'not your memory' }, 403);

  if (!body.redo) {
    const { data: have } = await db.rpc('get_brief', { p_chapter: chapter });
    if (have && have.place) return json({ ok: true, cached: true, brief: have });
  }

  const { data: st } = await db.rpc('memory_state', { p_chapter: chapter });
  if (!st || st.error) return json({ error: 'no such memory' }, 404);

  const occ = String((st.memory && st.memory.occasion) || 'holiday');
  const isHoliday = occ === 'holiday';
  let pack = null;
  if (!isHoliday) {
    const { data: p } = await db.from('occasions').select('*').eq('slug', occ).maybeSingle();
    pack = p || null;
  }
  const label = (pack && pack.label) || occ;
  const avoid = ((pack && pack.avoid_words) || []).map((w) => String(w).toLowerCase()).filter(Boolean);

  const pics = st.photographs || [];
  const people = (st.people || []).filter((p) => !p.is_you);

  const catalogue = pics.map((p) =>
    '[' + p.asset_id + '] ' + (p.description || 'no description')
    + (p.notable ? ' | notable: ' + p.notable : '')
    + (p.who ? ' | named: ' + p.who : '')
    + (p.is_clip ? ' | A VIDEO CLIP' + (p.transcript ? ', in which is said: "' + p.transcript + '"' : '') : '')
    + (p.worth_asking === false ? ' | nothing specific in it' : '')
  ).join('\n');

  const occasionBlock = isHoliday ? '' : (
    '=== THIS IS A ' + label.toUpperCase() + ' FILM, NOT A HOLIDAY ===\n'
    + (pack && pack.likely_spine ? 'What a film like this is usually about: ' + pack.likely_spine + '\n' : '')
    + (pack && pack.care_notes ? 'CARE: ' + pack.care_notes + '\n' : '')
    + (pack && (pack.vocabulary || []).length ? 'Words that fit: ' + pack.vocabulary.join(', ') + '\n' : '')
    + (avoid.length ? 'NEVER USE THESE WORDS: ' + avoid.join(', ') + '\n' : '')
    + 'NEVER ASSUME WHO WAS THERE, and never presume the people in it were together.\n\n');

  const prompt = 'Somebody is having a short film made from their own photographs, with a song written from what they tell you. Before you ask them ANYTHING, work out where this is and what kind of day it was.\n\n'
    + 'THE MEMORY IS CALLED: "' + st.memory.title + '" (part of a ' + st.memory.occasion + ' film)\n'
    + (people.length ? 'OTHER PEOPLE IN THE FILM: ' + people.map((p) => p.name + (p.relation ? ' (' + p.relation + ')' : '')).join(', ') + '\n' : '')
    + '\nTHE PHOTOGRAPHS:\n' + catalogue + '\n\n'
    + occasionBlock
    + 'You may run ONE web search, and only if the name or the pictures point at a real place you genuinely do not recognise. WHERE THIS IS CHANGES HOW TO ASK - the gates of Auschwitz and the entrance to Disneyland are both recognisable and do not want the same first question. If you already know what kind of place this is, DO NOT SEARCH. Speed matters here; the page is waiting.\n\n'
    + 'Reply with ONLY a JSON object:\n'
    + '{"place":"where this is, in plain words",\n'
    + ' "kind":"what kind of place or day",\n'
    + ' "register":"joy | warmth | awe | funny | ordinary | weight | grief",\n'
    + ' "likely":"what stories a day like this usually holds - where to dig. NOT facts about the place.",\n'
    + ' "promising":["asset_id","asset_id"],\n'
    + ' "opener":"the first question",\n'
    + ' "looked_up":"what you searched, or null"}\n\n'
    + 'REGISTER - everything hangs off it:\n'
    + 'weight or grief: a memorial, a war site, a grave, a hospital, anywhere people died. Nothing light, ever.\n'
    + 'awe: something enormous or ancient they travelled to see.\n'
    + (isHoliday
        ? 'joy / funny / warmth / ordinary: most days. Most holidays are ordinary and lovely and that is fine.\n\n'
        : 'joy / funny / warmth / ordinary: most days. Not every part of a ' + label.toLowerCase() + ' is a high point, and that is fine.\n\n')
    + 'PROMISING - the asset_ids most likely to have a STORY behind them, best first, 2 to 4. A person DOING something beats a person standing. A clip with somebody talking or laughing beats any still. Something odd or unexplained beats something expected. A view with nobody in it has no story and must not be listed.\n\n'
    + '=== THE OPENER - READ THIS TWICE ===\n\n'
    + 'ONE QUESTION. NOT TWO, NOT THREE. The last attempt asked "what were the highlights, the low points, and anything that went unexpectedly?" - people answer only the last part of a stacked question and the rest is wasted. NO "and" JOINING TWO QUESTIONS.\n\n'
    + 'IT MUST NOT BE ANSWERABLE WITH YES OR NO. Earlier attempts asked "was it everything you hoped for?" and got "It was brilliant"; then "did it live up to expectations?" and got "Yes". Both wasted the most valuable question in the memory.\n\n'
    + (isHoliday
        ? 'ASK FOR A LIST OF THINGS THAT HAPPENED. "What were the highlights of <place>?" or "What did the two of you get up to there?" or "What stands out about that one?" - in your own words, suited to this place, and VARIED, because eleven memories opening with eleven identical sentences is monotonous.\n\n'
        : 'ASK FOR A LIST OF THINGS THAT HAPPENED. "What stands out from that part of the day?" or "What do people still bring up about that bit?" - in your own words, suited to this part of the ' + label.toLowerCase() + ', and VARIED, because every memory opening with the same sentence is monotonous.\n\n')
    + 'WHY A LIST: it hands the next question several threads to pull. "It was brilliant" hands it none. Everything after this depends on the opener producing MORE THAN ONE THING.\n\n'
    + 'PLAIN AND CALM. No exclamation marks, no "Right!", no enthusiasm you have not earned. You are a person asking, not a host.\n\n'
    + 'ASK FOR WHAT HAPPENED AND WHO WAS DOING IT. Telling a story about a day is enjoyable; excavating a feeling is work. NEVER ask what somewhere smelled like, how it felt, or what it meant.\n\n'
    + 'FOR WEIGHT OR GRIEF the opener must signal where this is going without asking anything hard: "Tell me about the day you went there." Quiet and short, and it lets them decide how much to say. NEVER "what were the highlights" of a mass grave.\n\n'
    + 'NEVER STATE A FACT YOU FOUND. Knowing what a place is changes what you ASK; it is never something you SAY. You are talking to somebody who was there.';

  let f;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
        messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return json({ error: 'the writing service answered ' + r.status }, 502);
    const o = await r.json();
    let t = (o.content || []).filter((c) => c.type === 'text')
      .map((c) => c.text).join('').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    f = JSON.parse(t);
  } catch (e) {
    return json({ error: 'could not work out the memory - try again' }, 502);
  }
  if (!f || !f.opener) return json({ error: 'nothing usable came back' }, 502);

  // CHECKS, NOT HOPES. Three openers in a row broke a stated rule.
  let opener = String(f.opener).trim();
  const fallback = st.memory.solemn
    ? 'Tell me about the day you went there.'
    : 'What are the bits of ' + st.memory.title + ' that stand out when you think back?';
  // a yes/no opener wastes the most valuable question in the memory
  if (/^(was|were|did|do|does|is|are|have|has|had|would|could|can|will|should)\b/i.test(opener))
    opener = fallback;
  // a stacked question gets only its last part answered
  if ((opener.match(/\?/g) || []).length > 1 || /,\s*(and|or)\s+[a-z]/i.test(opener))
    opener = fallback;
  // a word this occasion must never use ("the trip" at a wedding)
  if (avoid.some((w) => opener.toLowerCase().includes(w)))
    opener = fallback;

  const ok = new Set(pics.filter((p) => p.worth_asking !== false).map((p) => p.asset_id));
  const promising = (Array.isArray(f.promising) ? f.promising : []).filter((id) => ok.has(id));

  await db.rpc('save_brief', {
    p_chapter: chapter,
    p_place: String(f.place || '').slice(0, 200),
    p_kind: String(f.kind || '').slice(0, 80),
    p_register: String(f.register || 'ordinary').slice(0, 20),
    p_likely: String(f.likely || '').slice(0, 600),
    p_promising: promising,
    p_opener: opener.slice(0, 300),
    p_looked_up: f.looked_up ? String(f.looked_up).slice(0, 200) : null,
  });

  return json({ ok: true, brief: { place: f.place, kind: f.kind,
    register: f.register, likely: f.likely, promising, opener,
    looked_up: f.looked_up || null } });
});
