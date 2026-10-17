/* pickcopy.js - A PHOTO MOVED DURING UPLOAD STILL GOES IN (16 Oct 2026, ADDITIONS-2026-10-15 B66; found by Tester 1).
   The browser reads a picked file only when its turn comes to be sent. Tester 1 moved his photos to another folder while they
   were going in, and every moved one failed ("Failed to fetch") - and the retry retried the same missing file.
   So the moment photos are picked, each is copied into this browser's own private storage on her device (the origin-private file
   system, OPFS) and sent from that copy. Nothing new leaves the device - the upload is unchanged. Streamed to disk, never held in
   memory (a film can be 700 MB+).
     - each copy is deleted as soon as its upload is confirmed (drop); copies left by a tab that was closed are deleted the next
       time a page opens (each open tab holds a Web Lock on its own folder, so another open tab's copies are never touched);
     - no OPFS, refused, or short of space -> no copy, today's behaviour (the page then says plainly when a file has gone). A copy
       that fails never blocks an upload.
   Phone pickers usually hand the page its own copy already; this is mainly for computers.
   Test: Song/pipeline/page_tests_b66_moved.py.
   window.PickCopy: ready (Promise - true once the folder is open), room(bytes), copy(file), drop(name), readable(file),
   why() - the last reason no copy was made. */
(function(){
  var TOP='mf-uploading', LOCK='mf-uploading-', SPARE=64*1048576, STALE_MS=6*3600000;
  var TAB=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  var dir=null, n=0, why='';                   // why: the last reason no copy was made (the page reports it - what each browser did)

  function gone(e){ var k=e&&e.name; return k==='NotFoundError'||k==='NotReadableError'; }
  async function readable(f){                  // a 1-byte read: a moved or deleted file fails it (NotFoundError)
    if(!f||!f.size) return false;
    try{ await f.slice(0,1).arrayBuffer(); return true; }catch(e){ return false; }
  }
  async function open(){
    if(!(window.isSecureContext&&navigator.storage&&navigator.storage.getDirectory)){ why='no private storage (OPFS) in this browser'; return false; }
    var root=await navigator.storage.getDirectory();
    var top=await root.getDirectoryHandle(TOP,{create:true});
    var probe=await top.getFileHandle('.probe-'+TAB,{create:true});
    var writable=typeof probe.createWritable==='function';
    await top.removeEntry('.probe-'+TAB);
    if(!writable){ why='private storage cannot be written from a page (no createWritable)'; return false; }   // today's behaviour
    if(navigator.locks){                        // hold this tab's lock for as long as the page is open
      await new Promise(function(granted){ navigator.locks.request(LOCK+TAB,function(){ granted(); return new Promise(function(){}); }); });
    }
    var held=null;
    try{ if(navigator.locks){ var q=await navigator.locks.query(); held=(q.held||[]).map(function(l){ return l.name; }); } }catch(_){}
    var old=[];
    for await (var name of top.keys()){
      if(name===TAB) continue;
      if(held){ if(held.indexOf(LOCK+name)<0) old.push(name); }          // its tab is closed
      else { var t=parseInt(String(name).split('-')[0],36); if(!(t>0)||Date.now()-t>STALE_MS) old.push(name); }
    }
    for(var i=0;i<old.length;i++){ try{ await top.removeEntry(old[i],{recursive:true}); }catch(_){} }
    dir=await top.getDirectoryHandle(TAB,{create:true});
    return true;
  }
  /* 17 Oct (B69): a reason carries an error's NAME only - its message could carry a file name, and the reason goes in the log */
  var ready=open().catch(function(e){ dir=null; why='private storage refused: '+((e&&e.name)||'unknown'); return false; });

  async function room(bytes){
    if(!(await ready)||!dir) return false;
    try{ var e=await navigator.storage.estimate(), free=(e.quota||0)-(e.usage||0);
         if(free>=bytes+SPARE) return true;
         why='short of space: '+Math.round(free/1048576)+' MB free, '+Math.round((bytes+SPARE)/1048576)+' MB needed'; return false; }
    catch(e){ why='could not check the space: '+((e&&e.name)||''); return false; }
  }
  /* -> {file, name}: a File with her file's own name, type, size and date, read from the copy;
        {missing:true}: her file could not be read (already moved or deleted); null: no copy (send her file as today) */
  async function copy(f){
    if(!(await ready)||!dir) return null;
    var name='f'+(++n)+'-'+Math.random().toString(36).slice(2,8);
    try{
      var h=await dir.getFileHandle(name,{create:true});
      var w=await h.createWritable();
      await f.stream().pipeTo(w);
      var c=await h.getFile();
      if(c.size!==f.size) throw new Error('copy is '+c.size+' bytes, not '+f.size);
      return {file:new File([c],f.name,{type:f.type,lastModified:f.lastModified}),name:name};
    }catch(e){
      try{ await dir.removeEntry(name); }catch(_){}
      if(gone(e)||!(await readable(f))) return {missing:true};
      why='the copy failed: '+((e&&e.name)||'unknown'); return null;
    }
  }
  async function drop(name){
    if(!name||!dir) return;
    try{ await dir.removeEntry(name); }catch(_){}
  }
  window.PickCopy={ready:ready,room:room,copy:copy,drop:drop,readable:readable,tab:TAB,why:function(){ return why; }};
})();
