/* sortsplit.js - ONE MEMORY, SEVERAL SEPARATE TIMES: a one-tap split suggestion on the sort screen (20 Oct 2026).
   Nigel's "Fun Times" held several different trips, so a photo from one trip was put in a song verse about another. When one
   memory's photos look like two different times, the sort screen says so, shows where the split would be (the photos on each
   side, with their dates), and splits it in ONE tap - the smaller part becomes a group of its own, named from its dates (she can
   rename it). It NEVER splits by itself; "Keep them together" hides it for that memory.

   THE RULE is pipeline/mixed_memories.py's, with the same numbers (page_tests_20_split checks both give the same answer):
     - a photo's time is trusted when the camera wrote it. load doesn't send date_source, so a run of 3+ photos under 5 minutes
       apart whose camera numbers run backwards or jump by more than 200 is a batch of copied files - its times are not trusted;
     - trusted photos more than 7 days apart are different times;
     - untrusted photos: camera numbers (IMG_1677) more than 500 apart AND more than 3x this memory's median step (the counter
       wraps at 9999) are different times; dated and undated photos are never compared;
     - a time with 2+ photos is an event; 2+ events of the same kind = mixed. The smallest event is offered (the earliest of equal
       ones): the memory's name stays with the bigger part.
   index.html's module exposes the sort state as window.__sort (M, cur, screen, page, paint, save). */
(function(){
  var SEP_DAYS=7, SEQ_GAP=500, SEQ_TYPICAL=3, SEQ_MOD=10000, BATCH_MIN=5, BATCH_JUMP=200;
  var TRUSTED={exif:1,filename:1}, UNTRUSTED={modified:1,none:1};
  var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function t(p){ var v=p&&p.taken_at?Date.parse(p.taken_at):NaN; return isFinite(v)?v:null; }
  function camNo(p){ var b=String(p.original_filename||'').replace(/\.[^.]*$/,''); var m=/^(.*?)(\d{4})\D*$/.exec(b);
    return m?[m[1].toUpperCase(),parseInt(m[2],10)]:null; }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function trustedIds(ps){
    var ok={}, unknown=[];
    ps.forEach(function(p){ var ds=p.date_source;
      if(t(p)===null||UNTRUSTED[ds]||p.date_reliable===false) return;
      if(TRUSTED[ds]||p.date_reliable===true) ok[p.id]=1; else unknown.push(p); });
    unknown.sort(function(a,b){return t(a)-t(b);});
    for(var i=0;i<unknown.length;){
      var j=i; while(j+1<unknown.length&&(t(unknown[j+1])-t(unknown[j]))<=BATCH_MIN*60000) j++;
      var batch=unknown.slice(i,j+1), copied=false;
      if(batch.length>=3) for(var k=1;k<batch.length;k++){ var a=camNo(batch[k-1]), b=camNo(batch[k]);
        if(a&&b&&a[0]===b[0]){ var back=b[1]<a[1]&&a[1]-b[1]<SEQ_MOD-BATCH_JUMP; if(back||b[1]-a[1]>BATCH_JUMP) copied=true; } }
      if(!copied) batch.forEach(function(p){ ok[p.id]=1; });
      i=j+1;
    }
    return ok;
  }
  function events(photos){
    var ps=photos.filter(function(p){return !p.excluded;}), ok=trustedIds(ps);
    var dated=ps.filter(function(p){return ok[p.id];}).sort(function(a,b){return t(a)-t(b);}), groups=[];
    dated.forEach(function(p){ var g=groups[groups.length-1];
      if(g&&t(p)-t(g[g.length-1])<=SEP_DAYS*86400000) g.push(p); else groups.push([p]); });
    var und={}, loose=[];
    ps.forEach(function(p){ if(ok[p.id]) return; var n=camNo(p); if(n) (und[n[0]]=und[n[0]]||[]).push([n[1],p]); else loose.push(p); });
    var ugroups=[];
    Object.keys(und).sort().forEach(function(prefix){
      var xs=und[prefix].sort(function(a,b){return a[0]-b[0]||(a[1].id<b[1].id?-1:a[1].id>b[1].id?1:0);});
      if(xs.length>1){ var best=-1,bi=0;                    // the counter wraps at 9999: start after the biggest circular gap
        for(var k=0;k<xs.length;k++){ var g=((xs[(k+1)%xs.length][0]-xs[k][0])%SEQ_MOD+SEQ_MOD)%SEQ_MOD; if(g>=best){best=g;bi=k;} }
        var st=(bi+1)%xs.length; xs=xs.slice(st).concat(xs.slice(0,st)); }
      var steps=[]; for(var k2=1;k2<xs.length;k2++) steps.push(((xs[k2][0]-xs[k2-1][0])%SEQ_MOD+SEQ_MOD)%SEQ_MOD);
      steps.sort(function(a,b){return a-b;});
      var cut=Math.max(SEQ_GAP,SEQ_TYPICAL*(steps.length?steps[Math.floor(steps.length/2)]:0)), cur=[];
      xs.forEach(function(x,k){ if(cur.length&&((x[0]-xs[k-1][0])%SEQ_MOD+SEQ_MOD)%SEQ_MOD>cut){ ugroups.push(cur); cur=[]; } cur.push(x[1]); });
      if(cur.length) ugroups.push(cur);
    });
    var big=function(g){return g.length>=2;};
    groups.concat(ugroups).filter(function(g){return !big(g);}).forEach(function(g){ loose=loose.concat(g); });
    return {dated:groups.filter(big), undated:ugroups.filter(big), loose:loose};
  }
  function monthName(ps){
    var ts=ps.map(t).filter(function(x){return x!==null;}).sort(function(a,b){return a-b;}); if(!ts.length) return '';
    var a=new Date(ts[0]), b=new Date(ts[ts.length-1]);
    var ay=a.getUTCFullYear(), am=a.getUTCMonth(), by=b.getUTCFullYear(), bm=b.getUTCMonth();
    if(ay===by&&am===bm) return MONTHS[am]+' '+ay;
    if(ay===by) return MONTHS[am]+' - '+MONTHS[bm]+' '+by;
    return MONTHS[am]+' '+ay+' - '+MONTHS[bm]+' '+by;
  }
  function suggestion(photos){
    var ev=events(photos), kinds=['dated','undated'];
    for(var i=0;i<kinds.length;i++){ var es=ev[kinds[i]]; if(es.length<2) continue;
      var g=es[0]; es.forEach(function(x){ if(x.length<g.length) g=x; });        // the smallest; the earliest of equal ones
      var move={}; g.forEach(function(p){ move[p.id]=1; });
      return {kind:kinds[i], move:g.map(function(p){return p.id;}),
              keep:photos.filter(function(p){return !p.excluded&&!move[p.id];}).map(function(p){return p.id;}),
              name:kinds[i]==='dated'?monthName(g):''};
    }
    return null;
  }
  window.SortSplit={events:events, suggestion:suggestion, monthName:monthName, trustedIds:trustedIds};

  /* ── the sort screen ── */
  var KEPT={};                                            // "Keep them together": per memory, for this visit
  function key(m){ return (m.id||'')+'|'+(m.title||'')+'|'+m.photos.length; }
  function thumbs(ps){ var h=ps.slice(0,4).map(function(p){
      return '<img src="'+esc(p.thumb_url||p.url)+'" alt="" loading="lazy" decoding="async" style="width:64px;height:64px;object-fit:cover;border-radius:6px">'; }).join('');
    return h+(ps.length>4?'<span style="align-self:center;margin-left:4px">+'+(ps.length-4)+' more</span>':''); }
  function side(label, ps){
    return '<div><p style="margin:0 0 6px;font-size:18px"><b>'+esc(label)+'</b></p>'+
      '<div style="display:flex;flex-wrap:wrap;gap:6px">'+thumbs(ps)+'</div></div>'; }
  function range(ps){ var n=monthName(ps); return n?n:''; }
  function offer(){
    var S=window.__sort; if(!S||S.page!=='sort'||S.screen!=='organise') return;
    var stage=document.getElementById('stage'), nm=document.getElementById('nm');
    if(!stage||!nm||document.getElementById('splitsug')) return;
    var m=S.M[S.cur]; if(!m||KEPT[key(m)]) return;
    var s=suggestion(m.photos); if(!s) return;
    var byId={}; m.photos.forEach(function(p){ byId[p.id]=p; });
    var mv=s.move.map(function(id){return byId[id];}), kp=s.keep.map(function(id){return byId[id];});
    var ml=mv.length+' photo'+(mv.length===1?'':'s')+(s.kind==='dated'?' · '+range(mv):'');
    var kd=kp.filter(function(p){ return !!window.SortSplit.trustedIds(m.photos)[p.id]; });
    var kl=kp.length+' other photo'+(kp.length===1?'':'s')+(s.kind==='dated'&&kd.length===kp.length&&range(kp)?' · '+range(kp):'');
    var why=s.kind==='dated'?'These were taken on different dates from the others.'
      :'Your camera took hundreds of photos between these and the others.';
    var box=document.createElement('section');
    box.id='splitsug'; box.className='goldnote'; box.setAttribute('aria-labelledby','splith');
    box.style.fontSize='18px';
    box.innerHTML='<h3 id="splith" style="margin:0 0 6px;font-size:20px">These look like two different times — split here?</h3>'+
      '<p style="margin:0 0 12px;font-size:18px">'+why+' Each time can have its own verse in the song.</p>'+
      side(ml,mv)+
      '<p style="margin:12px 0;border-top:3px dashed var(--goldline,#b8962e);padding-top:4px;font-size:16px;text-align:center">split here</p>'+
      side(kl,kp)+
      '<div class="acts" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px">'+
        '<button class="yes" id="splitgo" type="button" style="font-size:18px;min-height:48px">Split into two groups</button>'+
        '<button id="splitno" type="button" style="font-size:18px;min-height:48px">Keep them together</button></div>';
    var at=nm; while(at.parentNode&&at.parentNode!==stage) at=at.parentNode;          // the stage's own child that holds the name box
    var prev=at.previousElementSibling; if(prev&&/^H[1-3]$/.test(prev.tagName)) at=prev;  // above "What do you call this group?"
    stage.insertBefore(box,at);
    document.getElementById('splitgo').addEventListener('click',function(e){ e.stopPropagation(); split(s); });
    document.getElementById('splitno').addEventListener('click',function(e){ e.stopPropagation(); KEPT[key(m)]=1; box.remove(); say('Kept together.'); });
  }
  function say(text){ var l=document.getElementById('splitsay');
    if(!l){ l=document.createElement('p'); l.id='splitsay'; l.setAttribute('role','status'); l.setAttribute('aria-live','polite');
      l.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden'; document.body.appendChild(l); }
    l.textContent=''; setTimeout(function(){ l.textContent=text; },50); }
  function split(s){
    var S=window.__sort, M=S.M, j=S.cur, m=M[j]; if(!m) return;
    var move={}; s.move.forEach(function(id){ move[id]=1; });
    var moved=m.photos.filter(function(p){ return move[p.id]; });
    if(!moved.length||moved.length===m.photos.filter(function(p){return !p.excluded;}).length) return;
    m.photos=m.photos.filter(function(p){ return !move[p.id]; });
    moved.forEach(function(p){ p.is_hero=false; });
    M.splice(j+1,0,{title:s.name||'',register:m.register||'warm',story:'',photos:moved});
    S.cur=j+1; S.save(); S.paint(); window.scrollTo(0,0);
    var nm=document.getElementById('nm'); if(nm){ nm.focus(); if(!s.name) nm.placeholder='Give these photos a name'; }
    say('Split. This new group has '+moved.length+' photos'+(s.name?', called '+s.name+'. You can rename it.':'. Please give it a name.'));
  }
  function watch(){
    var stage=document.getElementById('stage'); if(!stage){ setTimeout(watch,200); return; }
    new MutationObserver(offer).observe(stage,{childList:true});
    offer();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',watch); else watch();
})();
