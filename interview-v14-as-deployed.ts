// THE INTERVIEW. Q1 opener (from the brief) -> Q2 THE SWEEP -> drill ONLY into
// what the sweep turned up. If it turned up nothing, CLOSE THE MEMORY.
//
// "Most of a holiday is just nice, and that is fine." A song needs five to seven
// real details in total, not one per memory. MOST MEMORIES SHOULD BE SHORT.
// "It was just a nice day" IS A COMPLETE ANSWER.
//
// THREE FAULTS FOUND BY WALKING IT AS A SECOND ANSWERER:
// 1. A SKIPPED OPENER CAME BACK IDENTICAL. The Q1/Q2 branches tested how many
//    turns were ANSWERED; a skipped opener leaves that at zero, so the brief's
//    opener was re-saved word for word without the model being asked. Count
//    turns ASKED.
// 2. THE SWEEP WAS THE SAME SENTENCE SIX TIMES OUT OF SIX. Five hard-coded
//    questions picked with Math.random(). I built the fixed list to stop a model
//    drifting into demanding a story, and traded that for MONOTONY - the exact
//    complaint that killed the previous design. Twelve now, picked by the
//    memory's own seq, so eleven memories get eleven different sentences.
// 3. "WHAT DID YOU AND PAT GET UP TO" - it named another ANSWERER as the
//    companion. Fixed in memory_state: a second answerer is not a character.
//
// 27 Sep - "ASK ME ABOUT SOMETHING ELSE" (skip_thread). A skip declines one
// question; this declines the SUBJECT. {turn_id, skip_thread:true} marks the
// open turn skipped and stage='declined' (rpc skip_thread, which checks the
// turn is hers). thread_state then says move_on, the prompt lists what she
// declined, and - because an instruction is a request - a question that goes
// back to a declined subject is refused in code: the memory closes instead.
//
// 27 Sep - THE OCCASION PACK WAS DEAD DATA. The interview said "their own
// holiday photographs" and "an airport is an airport" to every film, and never
// read `occasions` - so a wedding would have been interviewed as a holiday, its
// care notes ("absent parents... NEVER assume who was there") and never_ask list
// unseen. Now: a HOLIDAY gets exactly the text it had (unchanged, character for
// character); every other occasion gets its own words, its care notes and its
// spine, and avoid_words / never_ask are CHECKED on the question in code - one
// retry naming the fault, then the memory closes rather than ask it.
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

const MAX = 2 * 1024 * 1024;
function b64(bytes) {
  const CH = 8192; const parts = [];
  for (let i = 0; i < bytes.length; i += CH)
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
  return btoa(parts.join(''));
}

// Is a new question going back to a subject she declined? Content words shared,
// over the smaller set. 0.5 = half the substance of one is in the other.
const FILLER = new Set(('what when where which who whom whose why how did does do was were is are the a an '
  + 'and or but of to in on at for from with that this there then you your yours they them their she her '
  + 'he him his it its about any anything something some was been have had has would could can will just '
  + 'really that\'s what\'s there\'s one').split(' '));
function words(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z']{3,}/g)?.filter((w) => !FILLER.has(w)) || []);
}
function sameSubject(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n / Math.min(x.size, y.size) >= 0.5;
}

// TWELVE, and chosen by the memory's own number so eleven memories get eleven
// different sentences. Every one makes "no" easy, complete and unembarrassing.
const SWEEPS_BY = {
  // One day, lots of people. "No" still easy; nobody's presence assumed.
  wedding: [
    'Did anything go wrong on the day that you can laugh about now?',
    'Was there a moment in that part of the day that people still bring up?',
    'Did anybody do something there that nobody expected?',
    'Was there something said in that bit that has stuck with you?',
    'Anything happen there that was not in the plan?',
    'Was there a moment in that one you would like to have again?',
  ],
  // anything else: plain, occasion-neutral, never presumes who was there
  other: [
    'Was there anything that happened then that still gets brought up?',
    'Did anything go wrong, or turn out funnier than it should have?',
    'Was there a moment from that one that stuck?',
    'Anything happen then that nobody had planned?',
    'Is there a story from that one people still tell?',
    'Was there something from that time you would like to have again?',
  ],
};
const SWEEPS = [
  'Was there anything that happened there that the two of you still bring up?',
  'Did anything go wrong that day, or anything turn out funnier than it should have?',
  'Anything happen there worth telling somebody about, or was it just a good day?',
  'Was there a moment from that one that stuck, or was it more of a nice blur?',
  'Anything odd or funny happen while you were there?',
  'Did anything surprise you there, or was it much as you expected?',
  'Anything from that bit you have told people about since?',
  'Was there a story out of that one, or was it just a nice few hours?',
  'Did anything happen there that you would not have planned?',
  'Anything go sideways that day?',
  'Was there a bit of that one you would do again tomorrow?',
  'Anything happen there that still makes one of you laugh?',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const token = body && body.token;
  const chapter = body && body.chapter_id;
  if (!token || !chapter) return json({ error: 'need token and chapter_id' }, 400);

  // THE TOKEN DECIDES. Anything the page sends about who it is, is ignored.
  const { data: who } = await db.rpc('who_and_where', { p_token: token });
  if (!who || who.error) return json({ error: 'unknown token' }, 401);
  const person = who.person_id || null;
  const collection = who.collection_id;

  const { data: ch } = await db.from('chapters')
    .select('id').eq('id', chapter).eq('collection_id', collection).maybeSingle();
  if (!ch) return json({ error: 'no such memory on this film' }, 404);

  if (body.turn_id && body.skip_thread) {
    // "Ask me about something else" - fail loudly: a decline that did not save
    // must not quietly carry on as if it had.
    const { data: r, error: e } = await db.rpc('skip_thread', { p_token: token, p_turn: body.turn_id });
    if (e || !r || r.error) return json({ error: (r && r.error) || (e && e.message) || 'skip_thread failed' }, 409);
  } else if (body.turn_id) {
    await db.rpc('answer_turn_for', { p_token: token, p_turn: body.turn_id,
      p_answer: String(body.answer || '').trim() || null,
      p_skip: !String(body.answer || '').trim() });
  }

  const { data: st } = await db.rpc('memory_state',
    { p_chapter: chapter, p_person: person });
  if (!st || st.error) return json({ error: 'no such memory' }, 404);
  if (st.waiting && !body.regenerate) return json({ ok: true, waiting: true });

  const occ = String((st.memory && st.memory.occasion) || 'holiday');
  const isHoliday = occ === 'holiday';
  let pack = null;
  if (!isHoliday) {
    const { data: p } = await db.from('occasions').select('*').eq('slug', occ).maybeSingle();
    pack = p || null;
  }
  const label = (pack && pack.label) || occ;
  const avoid = ((pack && pack.avoid_words) || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const neverAsk = ((pack && pack.never_ask) || []).map((w) => String(w).toLowerCase()).filter(Boolean);
  // what a question must not contain for this occasion; null = fine
  const breaks = (q) => {
    const t = String(q || '').toLowerCase();
    const w = avoid.find((a) => t.includes(a));
    if (w) return 'it uses "' + w + '", a word this occasion must never use';
    const n = neverAsk.find((a) => sameSubject(a, t));
    if (n) return 'it asks about "' + n + '", which must never be asked';
    return null;
  };

  const { data: brief } = await db.rpc('get_brief', { p_chapter: chapter });
  const { data: floor } = await db.rpc('really_enough',
    { p_chapter: chapter, p_person: person });
  const { data: thread } = await db.rpc('thread_state',
    { p_chapter: chapter, p_person: person });
  const mayStop = !!(floor && floor.may_stop);
  const moveOn = !!(thread && thread.move_on);

  // what she has asked NOT to talk about, in this memory
  let dq = db.from('memory_turns').select('question,asset_id')
    .eq('chapter_id', chapter).eq('stage', 'declined');
  dq = person ? dq.eq('asked_of', person) : dq.is('asked_of', null);
  const { data: declinedRows } = await dq;
  const declined = declinedRows || [];

  const pics = st.photographs || [];
  const people = (st.people || []).filter((p) => !p.is_you);
  const me = (st.people || []).find((p) => p.is_you);
  // TURNS ASKED, NOT ANSWERED. A skipped question has been seen and declined,
  // and asking it again is the rudest possible response to that.
  const asked = Number(st.asked || 0);
  const CAP = Number(body.cap) || 6;

  const answers = (st.so_far || []).filter((d) => d.answer);

  // Q1 - the opener, from the brief. The brief is about the PLACE, so both
  // people get the same one.
  if (asked === 0 && brief && brief.opener) {
    const { data: saved } = await db.rpc('save_memory_turn', {
      p_chapter: chapter, p_level: 1, p_stage: 'open',
      p_question: brief.opener, p_asset: null, p_because_of: null,
      p_looked_up: brief.looked_up || null, p_asked_of: person });
    return json({ ok: true, question: brief.opener, asset_id: null,
      photos_set: true, turn_id: (saved && saved.turn_id) || null,
      asked: 1, enough: false, stage: 'open' });
  }

  // Q2 - THE SWEEP. Not written by a model: it must not drift into demanding a
  // story, and "no" must be easy to say. Chosen by the memory's own number so
  // eleven memories do not get one sentence eleven times.
  if (asked === 1 && !st.memory.solemn) {
    const n = Number((st.memory && st.memory.seq) || 1);
    const list = isHoliday ? SWEEPS : (SWEEPS_BY[occ] || SWEEPS_BY.other);
    const sweep = list[(n - 1) % list.length];
    const { data: saved } = await db.rpc('save_memory_turn', {
      p_chapter: chapter, p_level: 2, p_stage: 'sweep',
      p_question: sweep, p_asset: null, p_because_of: null, p_looked_up: null,
      p_asked_of: person });
    return json({ ok: true, question: sweep, asset_id: null, photos_set: true,
      turn_id: (saved && saved.turn_id) || null, asked: 2, enough: false,
      stage: 'sweep' });
  }

  const catalogue = pics.map((p) =>
    '[' + p.asset_id + '] ' + (p.description || 'no description')
    + (p.notable ? ' | notable: ' + p.notable : '')
    + (p.who ? ' | named: ' + p.who : '')
    + (p.is_clip ? ' | A VIDEO CLIP' + (p.transcript ? ', in which is said: "' + p.transcript + '"' : '') : '')
    + (p.worth_asking === false ? ' | nothing specific - never ask about this one' : '')
  ).join('\n');

  const history = answers.length
    ? answers.map((d) => 'YOU ASKED: ' + d.question + '\nTHEY SAID: "' + d.answer + '"').join('\n\n')
    : '(they have skipped everything so far)';

  const occasionBlock = isHoliday ? '' : (
    '\n=== THIS IS A ' + label.toUpperCase() + ' FILM, NOT A HOLIDAY ===\n'
    + (pack && pack.likely_spine ? 'What a film like this is usually about: ' + pack.likely_spine + '\n' : '')
    + (pack && pack.care_notes ? 'CARE: ' + pack.care_notes + '\n' : '')
    + (pack && (pack.vocabulary || []).length ? 'Words that fit: ' + pack.vocabulary.join(', ') + '\n' : '')
    + (avoid.length ? 'NEVER USE THESE WORDS: ' + avoid.join(', ') + '\n' : '')
    + (neverAsk.length ? 'NEVER ASK ABOUT: ' + neverAsk.join('; ') + '\n' : '')
    + 'NEVER ASSUME WHO WAS THERE.\n');

  const prompt = (isHoliday
      ? 'You are interviewing somebody about one memory from their own holiday photographs, so a song can be written from what they tell you.\n\n'
      : 'You are interviewing somebody about one part of their own photographs from a ' + label.toLowerCase() + ', so a song can be written from what they tell you.\n\n')
    + 'THE MEMORY: "' + st.memory.title + '"'
    + (brief && brief.place ? ' - ' + brief.place : '') + '\n'
    + 'Call them "you". NEVER use their name.\n'
    + (people.length ? (isHoliday ? 'OTHER PEOPLE ON THIS TRIP: ' : 'OTHER PEOPLE IN THIS FILM: ') + people.map((p) => p.name + (p.relation ? ' (' + p.relation + ')' : '')).join(', ') + '\n' : '')
    + (me ? 'If a photograph names ' + me.name + ', that is the person you are TALKING TO. Say "you".\n' : '')
    + (st.memory.solemn ? '\nTHIS ONE CARRIES REAL WEIGHT. Quiet, short, nothing light, ever.\n' : '')
    + '\nTHE PHOTOGRAPHS (they never see these ids). The descriptions were written by a machine and are sometimes WRONG, so never state what is in one:\n'
    + catalogue + '\n\n'
    + occasionBlock
    + 'THE CONVERSATION SO FAR:\n' + history + '\n\n'
    + (declined.length
        ? '=== THEY ASKED TO TALK ABOUT SOMETHING ELSE ===\nThey chose not to talk about:\n'
          + declined.map((d) => '- "' + d.question + '"').join('\n')
          + '\nLEAVE THAT SUBJECT ENTIRELY - not in other words, not from another angle, not through another photograph of it. If there is nothing else worth asking here, set enough TRUE.\n\n'
        : '')
    + '=== READ THIS BEFORE ANYTHING ELSE ===\n\n'
    + (isHoliday
        ? 'MOST OF A HOLIDAY IS JUST NICE, AND THAT IS FINE. People do not do something remarkable everywhere they go. They look at things. They eat. They walk about. AN EARLIER VERSION WENT LOOKING FOR SOMETHING SPECIAL IN EVERY MEMORY AND IT WAS EXHAUSTING TO ANSWER.\n\n'
        : 'NOT EVERY PART OF A ' + label.toUpperCase() + ' HOLDS A STORY, AND THAT IS FINE. AN EARLIER VERSION WENT LOOKING FOR SOMETHING SPECIAL IN EVERY MEMORY AND IT WAS EXHAUSTING TO ANSWER.\n\n')
    + 'They have now been asked whether anything happened there. LOOK AT WHAT THEY SAID.\n\n'
    + 'IF THEY NAMED SOMETHING - anything funny, anything that went wrong, anything they still bring up - THAT IS THE ONLY THING WORTH ASKING ABOUT. Drill into it: what happened, what somebody did, how it turned out. Two or three questions, no more.\n\n'
    + 'IF THEY DID NOT - "just a nice day", "nothing in particular" - THERE IS NOTHING THERE AND YOU MUST LET IT GO. Set enough TRUE and stop. A pretty afternoon with nothing in it is a perfectly good memory and it does not owe you a story.\n\n'
    + 'IF THEY HAVE SKIPPED EVERYTHING, they do not want to talk about this one. Set enough TRUE and let it go.\n\n'
    + 'NEVER ASK WHAT SOMEBODY DID OR SAID ABOUT SOMETHING THEY ONLY WATCHED. "When your boat went through that entrance, what was the first thing you actually did?" is unanswerable - you do not do anything, you look.\n\n'
    + 'DO NOT KEEP ASKING WHAT THE OTHER PERSON DID OR SAID. It is a good question ONCE, when somebody actually did something.\n\n'
    + (isHoliday
        ? 'DO NOT ASK FOR SMALL DETAIL ABOUT A SMALL PART OF THE TRIP. An airport is an airport.\n\n'
        : 'DO NOT ASK FOR SMALL DETAIL ABOUT A SMALL PART OF THE DAY.\n\n')
    + (moveOn
        ? '=== THIS THREAD IS SPENT. CHANGE THE SUBJECT NOW. ===\nTwo or more questions have gone to the same thing, the answers are getting shorter, or they asked for something else. GO TO SOMETHING ELSE, or a different photograph.\n\n'
        : '')
    + (mayStop ? '=== DO YOU HAVE ENOUGH? ===\n'
               : '=== NOT ENOUGH YET: ' + (floor ? floor.answers : 0) + ' answer(s), '
                 + (floor ? floor.words : 0) + ' words. ===\n')
    + 'YES if they named something and you know what happened and how it turned out.\n'
    + 'YES if they said nothing much happened. THAT IS AN ANSWER, NOT A FAILURE.\n'
    + 'NO only if they named something specific and you still do not know how it went.\n\n'
    + 'Reply with ONLY a JSON object:\n'
    + '{"enough":true or false,"have":"story | image | nothing-much","gap":"what is missing or null","next_question":"one short plain question, or null","asset_id":"id or null","because_of":"THEIR EXACT WORDS or null","looked_up":"what you searched or null"}\n\n'
    + 'THE QUESTION, if there is one:\n'
    + 'SHORT. One sentence. Plain enough for anyone aged 5 or 95. Never two questions joined by "and".\n'
    + 'NEVER ANSWERABLE WITH YES OR NO.\n'
    + 'NEVER ask anything they have already answered, and never re-ask something in different words.\n'
    + 'Never how it felt, never what it smelled like, never what it means to them now.\n'
    + 'NEVER GUESS WHO SOMEBODY IS unless they have told you. NEVER LEAD.';

  let content = prompt;
  const promising = (brief && Array.isArray(brief.promising) && brief.promising.length)
    ? brief.promising : pics.filter((p) => p.worth_asking !== false).map((p) => p.asset_id);
  const seen = new Set((st.so_far || []).map((d) => d.asset_id).filter(Boolean));
  const declinedAssets = new Set(declined.map((d) => d.asset_id).filter(Boolean));
  const showMe = promising.find((id) => !seen.has(id) && !declinedAssets.has(id));
  if (showMe) {
    try {
      const { data: a } = await db.from('assets')
        .select('thumb_path,storage_path,size_bytes').eq('id', showMe).maybeSingle();
      const path = a && (a.thumb_path || a.storage_path);
      if (path && !(!a.thumb_path && Number(a.size_bytes) > MAX)) {
        const { data: s } = await db.storage.from('uploads').createSignedUrl(path, 600);
        if (s && s.signedUrl) {
          const r = await fetch(s.signedUrl);
          const buf = await r.arrayBuffer();
          if (buf.byteLength <= MAX) {
            const ct = r.headers.get('content-type') || '';
            content = [{ type: 'image', source: { type: 'base64',
              media_type: ['image/jpeg','image/png','image/webp'].includes(ct) ? ct : 'image/jpeg',
              data: b64(new Uint8Array(buf)) } }, { type: 'text', text: prompt }];
          }
        }
      }
    } catch (_) { /* descriptions are enough */ }
  }

  const ask = async (extra) => {
    const c = typeof content === 'string' ? content + extra
      : [content[0], { type: 'text', text: content[1].text + extra }];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800,
        temperature: 1,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
        messages: [{ role: 'user', content: c }] }),
    });
    if (!r.ok) throw new Error('the writing service answered ' + r.status);
    const o = await r.json();
    let t = (o.content || []).filter((x) => x.type === 'text')
      .map((x) => x.text).join('').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    return JSON.parse(t);
  };
  let f;
  try {
    f = await ask('');
    // THE OCCASION CHECK: one retry naming the fault, then close rather than ask it
    const bad = f && f.next_question && f.enough !== true ? breaks(f.next_question) : null;
    if (bad) {
      f = await ask('\n\nYOUR LAST QUESTION WAS REFUSED: "' + f.next_question + '" - ' + bad + '. Write a different one, or set enough TRUE.');
      if (f && f.next_question && f.enough !== true && breaks(f.next_question))
        return json({ ok: true, done: true, enough: true, asked, have: f.have || 'nothing-much',
                      why: 'occasion rule: ' + breaks(f.next_question) });
    }
  } catch (e) {
    return json({ error: 'could not write a question - try again' }, 502);
  }

  if (f && (f.enough === true || !f.next_question))
    return json({ ok: true, done: true, enough: true,
                  have: (f && f.have) || null, asked });

  // THE CHECK, not the instruction: a question back onto a declined subject is
  // not asked. The memory closes instead - she said she was done with that.
  if (declined.some((d) => sameSubject(d.question, f.next_question)
                         || (f.asset_id && d.asset_id && f.asset_id === d.asset_id)))
    return json({ ok: true, done: true, enough: true, asked,
                  have: f.have || 'nothing-much', why: 'returned to a declined subject' });

  if (asked >= CAP)
    return json({ ok: true, done: true, enough: false, capped: true, asked,
                  have: (f && f.have) || 'nothing-much' });

  const ok2 = new Set(pics.filter((p) => p.worth_asking !== false).map((p) => p.asset_id));
  const asset = (f.asset_id && ok2.has(f.asset_id)) ? f.asset_id : null;

  const { data: saved } = await db.rpc('save_memory_turn', {
    p_chapter: chapter, p_level: asked + 1, p_stage: String(f.gap || 'drill').slice(0, 40),
    p_question: String(f.next_question).slice(0, 400), p_asset: asset,
    p_because_of: f.because_of ? String(f.because_of).slice(0, 300) : null,
    p_looked_up: f.looked_up ? String(f.looked_up).slice(0, 200) : null,
    p_asked_of: person });

  return json({ ok: true, asked: asked + 1, enough: false,
    have: f.have || null, gap: f.gap || null,
    turn_id: (saved && saved.turn_id) || null,
    question: f.next_question, asset_id: asset, photos_set: true,
    because_of: f.because_of || null, looked_up: f.looked_up || null });
});
