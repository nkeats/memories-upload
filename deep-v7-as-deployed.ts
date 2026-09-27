// THE ENGINE. Six levels of questions from ONE photograph, each built on the
// answer before it.
//
// MEASURED ON NINE REAL PHOTOGRAPHS. Levels 1-5 now work. Level 6 - the landing,
// the most important one - failed on length:
//
//   WORKED: "What's the part that always gets the biggest reaction from people
//           who weren't there?" -> "Leisa was squealing since NOBODY HAD GOT A
//           BITE ALL NIGHT" - the detail that makes the whole story funny, and
//           it had never appeared anywhere before.
//   FAILED: "All that food laid out for strangers who became table-companions
//           for a few hours, on a boat on Ha Long Bay - what do you tell people
//           when you try to explain what that meal actually was?" -> "we dont
//           really"
//
// I TOLD IT TO QUOTE THEIR STORY BACK AND IT STARTED WRITING ESSAYS. A BURIED
// QUESTION GETS A SHRUG. The quote is a hook, not a paragraph - and there is a
// length check now, because an instruction is a request.
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

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const WORD_CAP = { 6: 25 };

function toBase64(bytes) {
  const CH = 8192; const parts = [];
  for (let i = 0; i < bytes.length; i += CH)
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
  return btoa(parts.join(''));
}
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const STAGES = {
  1: { name: 'open', brief:
'LEVEL 1 - OPEN THE DOOR AND GET OUT OF THE WAY.\n'
+ 'Very nearly the whole question is "tell us about this one". You may add ONE short clause pointing at the most obviously human thing in the picture, but do NOT describe the photograph back to them or claim what anything IS.\n'
+ 'WHY: this question cannot carry a wrong premise, and a wrong premise is the fault that ate a quarter of the last interview.\n'
+ 'ROUTES IN:\n'
+ '- straight out: what was going on here?\n'
+ '- the moment: what was happening just then?\n'
+ '- the day: what sort of day was this one?\n'
+ '- the person: ask about whoever is plainly the subject' },

  2: { name: 'senses', brief:
'LEVEL 2 - PUT THEM BACK IN THE PLACE, THROUGH THE BODY.\n'
+ 'Context reinstatement, the highest-yielding technique in the Cognitive Interview. THIS IS WHERE EVERYTHING NOBODY PHOTOGRAPHS LIVES.\n'
+ 'ROUTES IN - choose ONE that suits THIS place. A cave is not a beach:\n'
+ '- sound: what could they hear\n'
+ '- air: heat, cold, wind, damp, how it smelled\n'
+ '- the body: feet, hands, tiredness, what they were carrying\n'
+ '- time of day: what the light was doing, whether they had eaten\n'
+ '- crowded or empty, loud or silent\n'
+ '- what was UNCOMFORTABLE about it, which people remember longest\n'
+ 'WORKED: "When you first walked up and actually saw it - what did your body do?"' },

  3: { name: 'thread', brief:
'LEVEL 3 - PULL THE THREAD THEY LEFT HANGING.\n'
+ 'Find the thing that OPENED AND DID NOT CLOSE. An outcome is missing. A person was named once and never explained. A feeling was stated with no picture under it.\n'
+ 'QUOTE THEM BACK, THEN ASK. The best question in the arc when the thread is there.\n'
+ 'ROUTES IN:\n'
+ '- the missing outcome: and then what happened?\n'
+ '- the unexplained person: who was that?\n'
+ '- the flat feeling: which part of it was that?\n'
+ '- something said in passing: ask them to finish it\n'
+ 'WORKED: "You said you had no idea how big - what did the two of you actually DO in that first moment?" (got: "we both stopped, looked at each other and went Wow")\n'
+ 'IF THERE IS NO THREAD: ask what happened NEXT. Never invent one.' },

  4: { name: 'other', brief:
'LEVEL 4 - SOMEBODY ELSE\'S VERSION.\n'
+ 'View the moment from another person\'s position and describe what THAT person would have seen.\n'
+ 'WORKED: "When Leisa found out she\'d been tricked, what did she do?" (got the whole story)\n'
+ 'FAILED: "Who else was there when you touched down?" -> "I was the only plane in." A FACT question, not a perspective one.\n'
+ 'ROUTES IN when somebody else is there:\n'
+ '- how would they tell this bit?\n'
+ '- what did the waiter, the guide, the driver make of them?\n'
+ '- what did the person behind the camera see that they did not?\n'
+ 'ROUTES IN WHEN THEY WERE ALONE - there is ALWAYS one:\n'
+ '- who did they TELL afterwards, and what did they say?\n'
+ '- what would the person waiting at home have pictured?\n'
+ 'NEVER ask who was there. Ask what somebody SAW or THOUGHT or DID.' },

  5: { name: 'around', brief:
'LEVEL 5 - JUST OUTSIDE THE FRAME, IN TIME.\n'
+ 'A photograph is one four-hundredth of a second. Ask about the minutes either side.\n'
+ 'WORKED: "Tell me about something that happened that day that nobody took a picture of." "After she found out, how did the rest of that evening go?"\n'
+ 'NEVER ASK WHO TOOK THE PHOTOGRAPH. It got "it\'s a selfie" and wasted the level.\n'
+ 'ROUTES IN:\n'
+ '- straight after: what happened next?\n'
+ '- just before: what were they doing five minutes earlier?\n'
+ '- the unphotographed: what happened that day nobody took a picture of?\n'
+ '- the thing that went wrong: every day has one\n'
+ '- what they meant to do and did not\n'
+ '- what they were worried about that morning' },

  6: { name: 'meaning', brief:
'LEVEL 6 - THE LANDING. KEEP IT SHORT. THIS IS THE WHOLE INSTRUCTION.\n'
+ '\n'
+ 'UNDER TWENTY WORDS. At most SIX of their words as a hook, then the question. No scene-setting, no summarising what they told you, no "all that food laid out for strangers on a boat on Ha Long Bay". They were there. They know.\n'
+ '\n'
+ 'WORKED: "What\'s the part that always gets the biggest reaction from people who weren\'t there?"\n'
+ '  -> got the detail that made the whole story funny, one nobody had ever mentioned.\n'
+ 'FAILED: a forty-word preamble before the question -> "we dont really".\n'
+ 'A BURIED QUESTION GETS A SHRUG.\n'
+ '\n'
+ 'IT MAY NOT BE ANSWERABLE IN ONE WORD. Not "do you still bring this up?" - that got "sometimes", "sometimes", "yes often". If yes, no, sometimes or often would answer it, IT IS THE WRONG QUESTION.\n'
+ '\n'
+ 'ROUTES IN - all short, all needing a sentence:\n'
+ '- the bit that gets the biggest reaction when they tell it\n'
+ '- what that day turned out to be the start of\n'
+ '- what they would say to the people standing there\n'
+ '- what they would have missed by not going\n'
+ '- the one thing from that day they would keep\n'
+ '- what has changed since, and what has not\n'
+ '\n'
+ 'NEVER "how did it make you feel" - no picture in it, gets "it was lovely".' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const assetId = String((body && body.asset_id) || '');
  if (!assetId) return json({ error: 'no asset_id' }, 400);
  // 27 Sep - a bare photograph id was enough to read and write its interview.
  // Now only the token of the film it belongs to opens it (deep.html sends it).
  const { data: owns } = await db.rpc('token_owns', { p_token: body.token || null, p_asset: assetId });
  if (owns !== true) return json({ error: 'not your photograph' }, 403);

  const turnId = body && body.turn_id;
  if (turnId) {
    const ans = String((body && body.answer) || '').trim();
    await db.from('deep_turns')
      .update({ answer: ans || '(skipped)', answered_at: new Date().toISOString() })
      .eq('id', turnId).eq('asset_id', assetId);
  }

  const { data: state } = await db.rpc('deep_state', { p_asset: assetId });
  if (!state || !state.asset) return json({ error: 'no such photograph' }, 404);
  if (state.waiting && !body.regenerate)
    return json({ ok: true, waiting: true, detail: 'the last question has not been answered yet' });

  const level = Math.min(7, Number(state.next_level) || 1);
  if (level > 6) return json({ ok: true, done: true, so_far: state.so_far });
  const stage = STAGES[level];
  const soFar = state.so_far || [];

  const { data: asset } = await db.from('assets')
    .select('storage_path,thumb_path,size_bytes').eq('id', assetId).maybeSingle();

  let img = null, why_no_image = null;
  try {
    const useThumb = !!(asset && asset.thumb_path);
    const path = useThumb ? asset.thumb_path : (asset && asset.storage_path);
    if (!useThumb && Number(asset && asset.size_bytes) > MAX_IMAGE_BYTES) {
      why_no_image = 'too large to read without a thumbnail';
    } else {
      const { data: signed } = await db.storage.from('uploads').createSignedUrl(path, 600);
      if (signed && signed.signedUrl) {
        const r = await fetch(signed.signedUrl);
        const buf = await r.arrayBuffer();
        if (buf.byteLength > MAX_IMAGE_BYTES) why_no_image = 'too large to read';
        else {
          const ct = r.headers.get('content-type') || '';
          img = { b64: toBase64(new Uint8Array(buf)),
                  media: ['image/jpeg','image/png','image/webp','image/gif'].includes(ct) ? ct : 'image/jpeg' };
        }
      }
    }
  } catch (_) { why_no_image = 'could not read the file'; }

  const history = soFar.length
    ? soFar.map((d) => 'YOU ASKED (' + d.stage + '): ' + d.question
        + '\nTHEY SAID: "' + (d.answer || '(skipped)') + '"').join('\n\n')
    : '(nothing yet - this is the first question)';

  const openings = soFar.map((d) => '"' + String(d.question).split(/[,?\u2014-]/)[0].trim() + '\u2026"');

  const base = 'You are interviewing somebody about ONE of their own photographs, so that a song can be written from what they tell you. You get ONE chance: if the questions are wrong, the song never gets the emotion it needs.\n\n'
    + (img ? 'The photograph is attached. LOOK AT IT.\n'
           : 'A machine described the photograph as: "' + (state.asset.description || 'unknown') + '". Treat that as a guess - it is often wrong, so never claim what anything IS.\n')
    + (state.asset.who ? 'People named in it: ' + state.asset.who + '\n' : '')
    + '\nTHE CONVERSATION SO FAR:\n' + history + '\n\n'
    + stage.brief + '\n\n'
    + (openings.length
        ? 'YOU HAVE ALREADY OPENED QUESTIONS LIKE THIS: ' + openings.join(', ')
          + '\nDO NOT OPEN THIS ONE THE SAME WAY.\n\n'
        : '')
    + 'Ask ONE question. Reply with ONLY a JSON object:\n'
    + '{"question":"...","because_of":"the exact words of theirs this comes from, or null at level 1"}\n\n'
    + 'RULES AT EVERY LEVEL:\n'
    + 'SHORT. A question longer than the answer is likely to be is too long, and a buried question gets a shrug.\n'
    + 'A QUESTION ANSWERABLE WITH YES, NO, SOMETIMES OR A SINGLE FACT IS A WASTED QUESTION.\n'
    + 'THE ROUTES ABOVE ARE ROUTES, NOT PHRASINGS. Do not copy their words.\n'
    + 'NEVER CLAIM WHAT SOMETHING IS. A machine called an airport departures arch "a yellow suitcase".\n'
    + 'NEVER GUESS WHO SOMEBODY IS unless they have already told you.\n'
    + 'NEVER LEAD. "Did she forgive you?" writes the answer. "What happened next?" does not.\n'
    + 'NEVER USE NEGATIVE PHRASING - documented to reduce recall.\n'
    + 'ONE QUESTION. Never two joined by "and".\n'
    + 'NEVER ASK ANYTHING THEY HAVE ALREADY ANSWERED.\n'
    + 'PLAIN WORDS. Someone aged 5 or 95 must understand instantly.';

  async function askModel(extra) {
    const text = extra ? base + '\n\n' + extra : base;
    const content = img
      ? [{ type: 'image', source: { type: 'base64', media_type: img.media, data: img.b64 } },
         { type: 'text', text }]
      : text;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500,
        temperature: 1, messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const o = await r.json();
    let t = (o.content || []).filter((c) => c.type === 'text')
      .map((c) => c.text).join('').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }

  let f, retried = false;
  try {
    f = await askModel(null);
    // A CHECK, NOT A HOPE. A long question is FIXABLE, so ask again rather than
    // refusing - refusing wastes the level entirely.
    const cap = WORD_CAP[level] || 30;
    if (f && f.question && words(f.question) > cap) {
      retried = true;
      f = await askModel('YOUR LAST ATTEMPT WAS ' + words(f.question)
        + ' WORDS AND THAT IS TOO LONG - it will get a shrug. Ask the same thing in UNDER FIFTEEN WORDS. Cut the scene-setting entirely; they were there.');
    }
  } catch (e) {
    return json({ error: 'could not write a question - try again' }, 502);
  }

  if (!f || !f.question) return json({ error: 'nothing usable came back' }, 502);

  const { data: saved } = await db.rpc('save_deep', {
    p_asset: assetId, p_level: level, p_stage: stage.name,
    p_question: String(f.question).slice(0, 400),
    p_because_of: f.because_of ? String(f.because_of).slice(0, 300) : null,
  });

  return json({ ok: true, level, stage: stage.name, of: 6,
                turn_id: (saved && saved.turn_id) || null,
                because_of: f.because_of || null,
                question: f.question, words: words(f.question),
                shortened: retried,
                so_far: state.so_far,
                saw_the_photograph: !!img, why_no_image });
});
