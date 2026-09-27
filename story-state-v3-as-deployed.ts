// STORY STATE v2 - and the decision rule underneath it.
//
// v1 tested story grammar (Mandler & Johnson 1977; Stein & Glenn 1979) on three
// real answers and got all three right: the squid prank complete, a description
// empty, and - the useful surprise - the MOULIN ROUGE reported as "warmth and a
// lovely moment, but no story yet".
//
// IT WAS RIGHT. And that material produced the best lyric this project has
// written. So:
//
//   EMOTION AND STORY ARE TWO DIFFERENT THINGS AND I HAD BEEN TREATING THEM AS
//   ONE. The squid prank works because it is a complete EPISODE - event, attempt,
//   outcome. The Moulin Rouge works because of an IMAGE: a woman standing a long
//   way off for forty years. Neither needed what the other had.
//
// Chasing completeness everywhere would have pushed the Moulin Rouge towards a
// plot it does not have - "whose idea was it, what triggered it" - and away from
// the thing that made it good.
//
// SO THE RULE: A MEMORY IS DONE WHEN IT HAS EITHER. A complete episode, OR one
// strong image with a feeling attached. Both is a gift. Neither means keep going.
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
  // 27 Sep - it read any memory's answers from a bare id, and would send any text
  // at all to the model on our key. Now: the film's token, and a memory of that film.
  const { data: owns } = await db.rpc('token_owns', { p_token: (body && body.token) || null,
    p_chapter: (body && body.chapter_id) || null, p_asset: (body && body.asset_id) || null });
  if (owns !== true) return json({ error: 'not your memory' }, 403);

  let said = String((body && body.said) || '').trim();
  if (!said && body.chapter_id) {
    const { data: d } = await db.from('memory_turns')
      .select('question,answer').eq('chapter_id', body.chapter_id).order('seq');
    said = (d || []).filter((x) => x.answer)
      .map((x) => 'Q: ' + x.question + '\nA: ' + x.answer).join('\n\n');
  }
  if (!said && body.asset_id) {
    const { data: d } = await db.from('deep_turns')
      .select('question,answer').eq('asset_id', body.asset_id).order('level');
    said = (d || []).filter((x) => x.answer)
      .map((x) => 'Q: ' + x.question + '\nA: ' + x.answer).join('\n\n');
  }
  if (!said) return json({ error: 'nothing to read' }, 400);

  const prompt = 'Below is what somebody has told an interviewer about one memory from their own life. A SONG is going to be written from it. Your job is to work out whether there is enough here yet, and if not, what ONE question would get it.\n\n'
    + 'WHAT THEY SAID:\n' + said + '\n\n'
    + 'A SONG CAN BE BUILT ON EITHER OF TWO THINGS, AND IT ONLY NEEDS ONE.\n\n'
    + '=== 1. A COMPLETE EPISODE - something HAPPENED ===\n'
    + 'Story grammar. The three core units are INITIATING EVENT, ATTEMPT and OUTCOME, and all three must be present for the episode to be complete.\n'
    + 'initiating_event - the thing that started it. Something happened or somebody decided something and the rest follows. WITHOUT IT THERE IS NO STORY, only a description of a place.\n'
    + 'attempt - what somebody actually DID. An action, by a person, with a verb.\n'
    + 'outcome - what happened as a result. Did it work, did it go wrong.\n'
    + 'reaction - what somebody said or did afterwards.\n'
    + 'Example of complete: squid fishing, nobody catching anything all night; he lifts her rod from behind; she thinks she has one and tells everybody; she is mortified and will not speak to him.\n\n'
    + '=== 2. A STRONG IMAGE WITH A FEELING ATTACHED - something MATTERED ===\n'
    + 'No plot needed. One concrete picture, and what it meant to somebody.\n'
    + 'the_image - a specific, physical, ordinary thing. A woman with her arms out in the road. A cap she wears everywhere. A man asleep on a bus.\n'
    + 'what_it_meant - why that moment landed, said plainly in their own words.\n'
    + 'Example of enough: a childhood dream, a woman going like an excited four-year-old, thanking him all the way home, and him saying he was happy to make her happy. NOTHING HAPPENS. It is plenty.\n\n'
    + 'Reply with ONLY a JSON object:\n'
    + '{"episode":{"setting":null,"initiating_event":null,"attempt":null,"outcome":null,"reaction":null,"complete":false},\n'
    + ' "image":{"the_image":null,"what_it_meant":null,"strong":false},\n'
    + ' "enough":true or false,\n'
    + ' "why":"one line - what they have got, or what is thin",\n'
    + ' "chase":"episode | image | null",\n'
    + ' "next_question":"one short plain question, or null if enough"}\n\n'
    + 'enough = the episode is complete OR the image is strong. EITHER ONE. Do not demand both.\n\n'
    + 'WHICH TO CHASE when there is not enough yet - this matters more than anything else here:\n'
    + 'If somebody has clearly DONE something and you are missing the outcome or the attempt, chase the EPISODE. Ask what happened next, what they did, how it turned out.\n'
    + 'If nothing happened but somebody plainly FELT something - a dream, a first time, a person lit up - chase the IMAGE. Ask what that person did or looked like, or what they said afterwards. DO NOT go hunting for a plot that is not there. "Whose idea was it and what triggered it" is the wrong question for a woman standing outside a theatre she has wanted to see since she was four.\n'
    + 'If there is neither - they have described a nice place and nothing else - ask what HAPPENED. That is the only way in.\n\n'
    + 'THE NEXT QUESTION:\n'
    + 'SHORT. One sentence. Plain enough for anyone.\n'
    + 'Ask for what somebody DID, SAID, or LOOKED LIKE. Never how something felt, never what it smelled like, never what it means to them now. Those are a chore to answer and they are not stories.\n'
    + 'Never answerable with yes, no, sometimes or a single fact.\n'
    + 'Quote their own words back when you are pulling a thread - "you said she wasn\'t happy with you after - what happened?"\n'
    + 'Never ask anything they have already answered.\n\n'
    + 'BE STRICT ABOUT enough. "We had a lovely time and the food was great" is neither an episode nor an image. Say so.';

  let f;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key,
                 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900,
        messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return json({ error: 'service answered ' + r.status }, 502);
    const o = await r.json();
    let t = (o.content || []).filter((c) => c.type === 'text')
      .map((c) => c.text).join('').replace(/```json|```/g, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    f = JSON.parse(t);
  } catch (e) {
    return json({ error: 'could not read it' }, 502);
  }

  return json({ ok: true, state: f });
});
