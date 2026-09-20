// THE INTERVIEW. No arc, no levels, no fixed number of questions.
// ASK -> CLASSIFY WHAT WE HAVE -> ASK FOR THE NAMED GAP -> STOP.
//
// It stops when the memory has EITHER a COMPLETE EPISODE (story grammar's three
// core units - initiating event, attempt, outcome) OR A STRONG IMAGE WITH A
// FEELING. Either one. Not both.
//
// THREE FAULTS FROM THE FIRST REAL WALK, ALL FIXED HERE:
// 1. IT STOPPED AFTER TWO QUESTIONS AND CALLED IT ENOUGH. The answer was "that's
//    Leisa having her feet nibbled by little fish" - a caption, not a story and
//    not an image. It never reached the squid prank, the best thing in that
//    memory. The model's judgement was the only thing deciding and it was
//    generous, so there is now a FLOOR it cannot stop below.
// 2. IT CAPPED AT SIX BEFORE ASKING ANYTHING, because six turns written by a
//    DIFFERENT engine were still in the table. A cap that fires before the first
//    question is a stall, not a cap.
//    ⚠ THIS IS NOT FIXED. An earlier version of this comment claimed it was.
//    memory_state computes 'asked' as count(*) from memory_turns for the
//    chapter, with NO engine filter, so every row written by memory-engine or
//    deep still counts against this cap. It is invisible on a chapter that has
//    been cleared and it bites on every chapter that has not. The fix needs an
//    engine column on memory_turns; until then, clear a chapter before running.
// 3. A STALE BRIEF WAS SERVED. "Did it live up to what you were expecting?" -
//    a yes/no opener written before that rule existed, cached, used anyway.
//
// v4, 20 Sep - THE AGENDA FIX. Run 3 got a perfect list of five things and
// spent every remaining question on one of them; the squid fishing, which holds
// the best story in the film, was named in the first answer and never asked
// about. Three changes: their first answer is now stated as an AGENDA, a spent
// thread forces a change of subject (in the prompt AND in code, because a
// judgement asked of a model is not a rule), and the cap goes up because six
// stopped one question short of the line the song needs.
// v5 - an opener that survives a missing brief. See the comment at !history.
// v6 - THREE questions per thing, not two. Nigel: "it needs three questions to
//      get to the real story."
// v7 - at least three, up to FOUR where the thread is still giving. Nigel: "we
//      can go 4 if its required, I feel most will need at least 3." The ceiling
//      in thread_state moved to 4, and the SHRINKING-ANSWER test is what decides
//      whether a thread earns a fourth. That test is now SCOPED to the current
//      thread; unscoped, it compared the last two answers anywhere in the
//      memory, so a short first answer on a NEW subject read as a dying thread
//      and would have kicked the interview off it after a single question.
//      Cap -> 12: the opener plus three threads of up to four.
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

  if (body.turn_id) {
    await db.rpc('answer_memory_turn', { p_token: token, p_turn: body.turn_id,
      p_answer: String(body.answer || '').trim() || null,
      p_skip: !String(body.answer || '').trim() });
  }

  const { data: st } = await db.rpc('memory_state', { p_chapter: chapter });
  if (!st || st.error) return json({ error: 'no such memory' }, 404);
  if (st.waiting && !body.regenerate) return json({ ok: true, waiting: true });

  const { data: brief } = await db.rpc('get_brief', { p_chapter: chapter });
  const pics = st.photographs || [];
  const people = (st.people || []).filter((p) => !p.is_you);
  const me = (st.people || []).find((p) => p.is_you);
  const asked = Number(st.asked || 0);
  // 12 - the opener plus three threads of up to four. It was 6, which stopped
  // one question short of "she told everyone she'd caught a squid before I
  // owned up". This is a BACKSTOP, not a target: the memory stops as soon as it
  // has an episode or an image, which should be 4 to 7 questions. If the cap is
  // being hit regularly the stopping rule is wrong, not the cap.
  const CAP = Number(body.cap) || 12;

  // THE FLOOR. Two short answers is a caption, not a memory.
  const { data: floor } = await db.rpc('really_enough', { p_chapter: chapter });
  const mayStop = !!(floor && floor.may_stop);

  // IS THIS THREAD SPENT? Four questions on the same photograph, or a second-or-
  // later question on it whose answer came back shorter. Either means the well
  // is dry. See thread_state - the scoping of the shrink test matters.
  const { data: thread } = await db.rpc('thread_state', { p_chapter: chapter });
  const moveOn = !!(thread && thread.move_on);

  const catalogue = pics.map((p) =>
    '[' + p.asset_id + '] ' + (p.description || 'no description')
    + (p.notable ? ' | notable: ' + p.notable : '')
    + (p.who ? ' | named: ' + p.who : '')
    + (p.is_clip ? ' | A VIDEO CLIP' + (p.transcript ? ', in which is said: "' + p.transcript + '"' : '') : '')
    + (p.worth_asking === false ? ' | nothing specific in it - never ask about this one' : '')
  ).join('\n');

  const history = (st.so_far || []).length
    ? st.so_far.map((d) => 'YOU ASKED: ' + d.question
        + '\nTHEY SAID: "' + (d.answer || '(they skipped it)') + '"').join('\n\n')
    : null;

  // ⚠⚠⚠ THEIR FIRST ANSWER IS AN AGENDA, NOT A SINGLE THREAD.
  // memory_state's so_far is already filtered to answered turns, in seq order,
  // so element 0 is the first thing they told us.
  const firstAnswer = ((st.so_far || [])[0] || {}).answer || null;
  const agenda = firstAnswer
    ? '=== THEIR FIRST ANSWER IS YOUR AGENDA ===\n"' + firstAnswer + '"\n\n'
      + 'EVERY THING THEY NAMED IN THERE IS A THREAD AND YOU MUST WORK THROUGH THEM.\n'
      + 'The worst failure this interview has had: they listed FIVE things - two nights\n'
      + 'aboard, islands, riding bikes, SQUID FISHING, a fish pedicure - and every\n'
      + 'remaining question went to the fish pedicure. The squid fishing held the best\n'
      + 'story in the whole film and was NEVER ASKED ABOUT.\n'
      + 'AT LEAST THREE QUESTIONS PER THING, THEN MOVE TO THE NEXT THING THEY NAMED.\n'
      + 'THREE, not one and not two. The best story this interview has ever got took\n'
      + 'three: he lifted her fishing rod from behind; she told everyone she had caught\n'
      + 'one; she did not speak to him until the next island. Stopping at two gets the\n'
      + 'prank and misses what made it a story.\n'
      + 'A FOURTH ONLY IF THE THIRD ANSWER OPENED SOMETHING NEW - a person not\n'
      + 'mentioned before, a consequence, something that happened after. If the third\n'
      + 'answer just rounded the story off, that thing is DONE. Never a fourth merely\n'
      + 'to reach four.\n'
      + 'Before writing anything: look at that first answer and work out which of the\n'
      + 'things in it you have NOT touched.\n\n'
    : '';

  const spent = moveOn
    ? '=== THIS THREAD IS SPENT. CHANGE THE SUBJECT NOW. ===\n'
      + 'Four questions have gone to the same thing, or the answers on it are getting\n'
      + 'shorter. Either way there is nothing left there. GO TO SOMETHING ELSE THEY\n'
      + 'NAMED, or a different photograph. Do NOT ask another question about what you\n'
      + 'just asked about.\n\n'
    : '';

  // NOTHING SAID YET -> THE OPENER. Free recall, no photograph, asking for a
  // LIST, because their first answer is the agenda for everything after it.
  // get_brief returns jsonb null when no brief row exists - after a reset, or
  // if brief has not run yet - and without this fallback the prompt below was
  // built with history = null and carried the literal word "null" into it.
  if (!history) {
    const opener = (brief && brief.opener)
      || 'Tell us about ' + st.memory.title + '. Start anywhere, and say as much or as little as you like.';
    const { data: saved } = await db.rpc('save_memory_turn', {
      p_chapter: chapter, p_level: 1, p_stage: 'open',
      p_question: opener, p_asset: null, p_because_of: null,
      p_looked_up: (brief && brief.looked_up) || null });
    return json({ ok: true, question: opener, asset_id: null,
      photos_set: true, turn_id: (saved && saved.turn_id) || null,
      asked: 1, enough: false, stage: 'open',
      brief_missing: !(brief && brief.opener) });
  }

  const prompt = 'You are interviewing somebody about ONE memory from their own photographs, so a SONG can be written from what they tell you.\n\n'
    + 'THE MEMORY: "' + st.memory.title + '"'
    + (brief && brief.place ? ' - ' + brief.place : '') + '\n'
    + (brief && brief.register ? 'THE MOOD OF THIS ONE: ' + brief.register + '\n' : '')
    + 'Call them "you". NEVER use their name.\n'
    + (people.length ? 'OTHER PEOPLE: ' + people.map((p) => p.name + (p.relation ? ' (' + p.relation + ')' : '')).join(', ') + '\n' : '')
    + (me ? 'If a photograph names ' + me.name + ', that is the person you are TALKING TO. Say "you".\n' : '')
    + (st.memory.solemn ? '\nTHIS ONE CARRIES REAL WEIGHT. Quiet, short, nothing light, ever.\n' : '')
    + '\nTHE PHOTOGRAPHS (they never see these ids). The descriptions were written by a machine and are sometimes WRONG - it once called an airport departures arch "a yellow suitcase" - so never state what is in one:\n'
    + catalogue + '\n\n'
    + agenda
    + 'WHAT THEY HAVE TOLD YOU:\n' + history + '\n\n'
    + spent
    + (mayStop
        ? '=== DO YOU HAVE ENOUGH? ===\n'
        : '=== YOU DO NOT HAVE ENOUGH YET. You have ' + (floor ? floor.answers : 0)
          + ' answer(s) and ' + (floor ? floor.words : 0) + ' words. THAT IS A CAPTION, NOT A MEMORY. Set enough FALSE and ask the next question. ===\n')
    + 'A song needs EITHER of these, and only ONE:\n\n'
    + 'A COMPLETE EPISODE - something happened. All three needed:\n'
    + '  INITIATING EVENT (what started it) + ATTEMPT (what somebody DID) + OUTCOME (what happened as a result).\n'
    + '  Example: nobody catching anything all night; he lifts her rod from behind; she thinks she has one and tells everybody; she is mortified.\n\n'
    + 'A STRONG IMAGE WITH A FEELING ATTACHED - nothing happened, and it does not matter:\n'
    + '  one concrete picture AND what it meant to somebody. BOTH HALVES.\n'
    + '  Example: a childhood dream, a woman going like an excited four-year-old outside a theatre, thanking him all the way home, him saying he was happy to make her happy.\n\n'
    + 'BE STRICT. "That\'s Leisa having her feet nibbled by little fish" is a CAPTION - it describes a picture and stops. It is not an episode (nothing follows from it) and not an image with a feeling (nobody is changed by it). WHEN SOMEBODY DESCRIBES A PHOTOGRAPH, ASK WHAT HAPPENED NEXT.\n\n'
    + '=== ASK FOR THE ONE THING MISSING ===\n'
    + 'Somebody clearly DID something but you do not know how it turned out -> ask what happened.\n'
    + 'Nothing happened but somebody plainly FELT something -> ask what that person DID, SAID or LOOKED LIKE.\n'
    + 'They have described a place or a picture and nothing else -> ask what they actually DID, or what happened next.\n\n'
    + 'AND USE THE PHOTOGRAPHS. They mention a car show and there is a picture of somebody beside a car: ask about THAT one, with its asset_id. A clip where somebody is laughing is the best thing in any group.\n'
    + 'DO NOT ASK ABOUT A PHOTOGRAPH MORE THAN FOUR TIMES, and only reach four if the third answer opened something new.\n\n'
    + 'YOU MAY SEARCH THE WEB when they name something you do not know. What you may learn is WHAT KIND OF THING IT IS - that turns "where was this?" into "were you showing it there?". YOU MAY NEVER TAKE THE CUE LIST FROM THE SEARCH: "was it the heat, the crowds, the narrow passages?" is you answering for them. Never state a fact you found.\n\n'
    + 'Reply with ONLY a JSON object:\n'
    + '{"have":"episode | image | neither","enough":true or false,"gap":"what is missing","next_question":"...","asset_id":"id or null","because_of":"THEIR EXACT WORDS or null","looked_up":"what you searched or null"}\n\n'
    + 'because_of MUST be a direct quote of something they actually said, or null. Never your own note.\n\n'
    + 'THE QUESTION:\n'
    + 'SHORT. One sentence. Plain enough for anyone aged 5 or 95.\n'
    + 'ASK WHAT SOMEBODY DID, SAID OR LOOKED LIKE. Never how it felt, never what it smelled like, never what it means now. Those are a chore and they are not stories.\n'
    + 'NEVER ANSWERABLE WITH YES OR NO. "Did it live up to what you expected?" got "Yes" and wasted a question.\n'
    + 'NEVER ask anything they have already answered or skipped.\n'
    + 'NEVER ASK THE SAME THING TWICE IN DIFFERENT WORDS. "What did she say when it was over?" was asked twice in a row, the second time as "when it was over and she admitted she enjoyed it - what did she say or do?". It is the rudest thing this interview does. Three questions on one thing means three DIFFERENT questions that move the story forward, not one question reworded.\n'
    + 'NEVER GUESS WHO SOMEBODY IS unless they have told you. NEVER LEAD. ONE question.';

  let content = prompt;
  const promising = (brief && Array.isArray(brief.promising) && brief.promising.length)
    ? brief.promising : pics.filter((p) => p.worth_asking !== false).map((p) => p.asset_id);
  const seen = new Set((st.so_far || []).map((d) => d.asset_id).filter(Boolean));
  const showMe = promising.find((id) => !seen.has(id)) || promising[0];
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

  let f;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900,
        temperature: 1,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) return json({ error: 'the writing service answered ' + r.status }, 502);
    const o = await r.json();
    let t = (o.content || []).filter((c) => c.type === 'text')
      .map((c) => c.text).join('').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    f = JSON.parse(t);
  } catch (e) {
    return json({ error: 'could not write a question - try again' }, 502);
  }

  // A FLOOR, NOT A SUGGESTION. It may only stop when there is something there.
  if (f && f.enough === true && mayStop)
    return json({ ok: true, done: true, enough: true, have: f.have || null,
                  asked, why: f.gap || null });

  if (asked >= CAP)
    return json({ ok: true, done: true, enough: false, capped: true, asked,
                  have: f.have || 'neither' });

  if (!f || !f.next_question)
    return json({ ok: true, done: true, enough: false, asked,
                  have: (f && f.have) || 'neither' });

  const ok2 = new Set(pics.filter((p) => p.worth_asking !== false).map((p) => p.asset_id));
  let asset = (f.asset_id && ok2.has(f.asset_id)) ? f.asset_id : null;

  // ⚠ A JUDGEMENT ASKED OF A MODEL IS NOT A RULE. The prompt above tells it to
  // change the subject; this makes sure it did. A spent thread may not point at
  // a picture that has already been answered about.
  if (moveOn && asset && seen.has(asset)) asset = null;

  const { data: saved } = await db.rpc('save_memory_turn', {
    p_chapter: chapter, p_level: asked + 1, p_stage: String(f.gap || 'gap').slice(0, 40),
    p_question: String(f.next_question).slice(0, 400), p_asset: asset,
    p_because_of: f.because_of ? String(f.because_of).slice(0, 300) : null,
    p_looked_up: f.looked_up ? String(f.looked_up).slice(0, 200) : null });

  return json({ ok: true, asked: asked + 1, enough: false,
    have: f.have || 'neither', gap: f.gap || null,
    turn_id: (saved && saved.turn_id) || null,
    question: f.next_question, asset_id: asset, photos_set: true,
    because_of: f.because_of || null, looked_up: f.looked_up || null });
});
