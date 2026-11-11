/* Hollywood Empire V4.84: Github Pages / Supabase host-coordinated online beta.
   Server authenticates room seats and turns. Host browser executes the existing game engine.
   Not suitable for adversarial or prize-money competitive play. */
(()=>{'use strict';
 const bridge=window.HollywoodOnlineBridge;if(!bridge)return;
 const API='https://umrzadpfoylkgdcaauiu.supabase.co/functions/v1/he-room';
 const eras=window.HollywoodGenreTest?.eras||[];
 const KEY='he-supabase-room-v1';
 let session=null,version=-1,snapshot=null,started=false,pendingId='',working=false,requesting=false,stopped=false;
 let seenError=null;
 const style=document.createElement('style');style.textContent=`
 #heOnlineOpen{position:fixed;top:9px;right:9px;z-index:9997;background:#e2b96f;color:#152037;border:2px solid #18243a;border-radius:12px;padding:9px;font:700 13px system-ui;box-shadow:0 4px 15px #0008}
 #heOnlinePanel{position:fixed;inset:0;background:#07101ced;z-index:9999;display:none;overflow-y:auto;padding:18px 10px}
 #heOnlinePanel.active{display:block}
 #heOnlineInner{max-width:510px;margin:auto;background:#15223a;border:1px solid #b18f59;border-radius:15px;color:#fff;padding:18px;font:15px system-ui}
 #heOnlineInner input,#heOnlineInner select{box-sizing:border-box;width:100%;padding:11px;margin:6px 0 12px;background:#0c1528;color:#fff;border:1px solid #71819b;border-radius:8px}
 #heOnlineInner button{background:#e3b86b;color:#172335;border:0;border-radius:8px;padding:10px 14px;font-weight:700;margin:4px}
 #heOnlineInner button.subtle{background:#314058;color:white}
 #heOnlineInner label{display:block;margin-top:6px;font-size:13px;color:#ccd5e9}
 #heOnlineErr{min-height:24px;color:#ffb8ad;white-space:pre-wrap}
 #heOnlineStatus{position:fixed;bottom:12px;left:12px;max-width:82vw;z-index:9996;background:#142238f5;border:1px solid #b18f59;border-radius:10px;color:white;padding:8px;font:13px system-ui;display:none}
 `;document.head.append(style);
 const open=document.createElement('button');open.id='heOnlineOpen';open.textContent='🌐 Online game';
 const panel=document.createElement('div');panel.id='heOnlinePanel';panel.innerHTML=`<section id="heOnlineInner">
 <div style="display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0">🌐 Hollywood Empire Online</h2><button id="heOnlineClose" class="subtle">Close</button></div>
 <p>Create a room, join from another phone, and keep your reconnect key in this browser. The host's browser processes game turns.</p>
 <label>Studio name</label><input id="heName" maxlength="32" value="Silverlight Pictures" />
 <button id="heCreate">Create room</button>
 <label>Join room code</label><input id="heCode" maxlength="6" placeholder="ABC234" autocapitalize="characters" />
 <button id="heJoin">Join room</button><button id="heReconnect" class="subtle">Reconnect</button>
 <div id="heRoom" style="display:none;border-top:1px solid #5b6a7f;margin-top:15px;padding-top:12px">
 <h3 id="heRoomTitle"></h3><p id="heRoomMembers"></p><p id="heTurn"></p>
 <div id="heHostSetup"><label>Starting era</label><select id="heStartEra"></select><label>Ending era</label><select id="heEndEra"></select><label>AI studios</label><select id="heBots"><option>0</option><option>1</option><option>2</option><option>3</option></select><button id="heStart">Start game</button></div>
 </div><p id="heOnlineErr"></p>
 <p style="font-size:12px;color:#c7d1e1">Beta: The host must keep the game open to process moves. Server checks room and turn ownership, but game calculations run in the host browser. Offline saves are kept separately.</p>
 <button id="heStop" class="subtle">Disconnect (reload for offline save)</button></section>`;
 const status=document.createElement('div');status.id='heOnlineStatus';document.body.append(open,panel,status);
 const $=id=>document.getElementById(id),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(let i=0;i<eras.length;i++){const label=eras[i].from===eras[i].to?''+eras[i].from:`${eras[i].from}–${eras[i].to}`;for(const id of ['heStartEra','heEndEra']){const el=document.createElement('option');el.value=String(i);el.textContent=label;$(id).append(el)}}$('heEndEra').value=String(eras.length-1);
 function error(s){$('heOnlineErr').textContent=String(s||'')}
 function show(){panel.classList.add('active')}function hide(){panel.classList.remove('active')}
 open.onclick=show;$('heOnlineClose').onclick=hide;
 async function api(data){const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});let result;try{result=await response.json()}catch{throw Error('Supabase did not return JSON')}if(!response.ok||result.error)throw Error(result.error||'HTTP '+response.status);return result}
 async function send(op,extra={}){if(!session)throw Error('Not connected');return api({op,code:session.code,token:session.token,...extra})}
 function joinSession(data){session={code:data.code,token:data.token,seat:data.seat};localStorage.setItem(KEY,JSON.stringify(session));version=-1;seenError=null;started=false;window.__heOnlineActive=true;open.textContent='🌐 '+session.code;$('heRoom').style.display='block';error('');show();}
 async function createOrJoin(kind){try{error('Connecting…');const data=await api({op:kind,name:$('heName').value,code:$('heCode').value.trim().toUpperCase()});joinSession(data);await poll()}catch(e){error(e.message)}}
 $('heCreate').onclick=()=>createOrJoin('create');$('heJoin').onclick=()=>createOrJoin('join');
 $('heReconnect').onclick=async()=>{try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(!saved)throw Error('No reconnect key saved in this browser.');joinSession(saved);await poll()}catch(e){error(e.message)}};
 $('heStop').onclick=()=>{if(!confirm('Disconnect from the shared game? Reload to resume your separate offline save.'))return;session=null;window.__heOnlineActive=false;stopped=true;location.reload()};
 async function start(){if(!session||session.seat!==0)return;try{
  const bots=Number($('heBots').value),startTurn=Number($('heStartEra').value),endTurn=Number($('heEndEra').value);
  if(startTurn>endTurn)throw Error('End era must be after start era');
  const room=await send('poll');const names=room.members.map(x=>x.name);
  if(names.length+bots>4)throw Error('Maximum four studios, including AI');
  if(!confirm('Start online campaign? Any existing OFFLINE save remains untouched; online progress is stored in Supabase.'))return;
  // Only online UI has the right to initialize this game engine.
  window.__heOnlineActive=true;
  bridge.init({startTurn,endTurn,humans:names.length,bots,names});
  const state=bridge.getSnapshot();await send('start',{state,bots});await poll();hide();
 }catch(e){error(e.message);show()}}
 $('heStart').onclick=start;
 async function hostAction(p){if(!session||session.seat!==0||working)return;working=true;try{
  if(p.type==='buy')bridge.action('buy',{filmId:p.filmId});
  else if(p.type==='pass')bridge.action('pass');
  else if(p.type==='advance')bridge.action('advance');
  else if(p.type==='tv')bridge.action('tv',{filmId:p.filmId,playerIndex:p.playerIndex,enabled:p.enabled});
  else throw Error('Unsupported action');
  await send('commit',{actionId:p.id,version,state:bridge.getSnapshot()});pendingId=p.id;await poll();
 }catch(e){try{await send('abort',{actionId:p.id,message:e.message})}catch{}error('Turn processing failed: '+e.message);show();await poll().catch(()=>{})}finally{working=false}}
 async function poll(){if(!session||requesting||stopped)return;requesting=true;try{
  const m=await send('poll',{since:version});
  started=m.started;$('heRoom').style.display='block';$('heRoomTitle').textContent=`Room ${m.code} · Your seat #${session.seat+1}`;
  $('heRoomMembers').innerHTML='<b>Studios:</b> '+m.members.map(x=>`#${x.seat+1} ${safe(x.name)}`).join(' · ');
  $('heHostSetup').style.display=(!started&&session.seat===0)?'block':'none';
  if(m.state){snapshot=m.state;version=m.version;window.__heOnlineActive=true;bridge.setSnapshot(snapshot)}
  else if(version<0){version=m.version}
  const who=snapshot?.queue?.[0];const turn=!started?'Waiting for host to start':snapshot?.complete?'Campaign finished':who==null?'All drafting done; host can advance':`On the clock: ${snapshot?.players?.[who]?.name||'Studio '+(who+1)}`;
  $('heTurn').textContent=turn;status.textContent=`🌐 ${m.code} · Seat #${session.seat+1} · ${turn}`;status.style.display='block';
  if(m.lastError && m.lastError!==seenError){seenError=m.lastError;error(m.lastError);show()}
  if(m.pending && session.seat===0 && m.pending.id!==pendingId && !working){
   const task=m.pending;requesting=false;await hostAction(task);return;
  }
 }catch(e){error('Connection: '+e.message);status.textContent='⚠ Multiplayer connection issue';status.style.display='block'}finally{requesting=false}}
 setInterval(()=>{if(session&&!stopped)poll()},1700);
 async function submit(action){try{if(!session||!started)throw Error('The game has not started');const data=await send('submit',{version,action});if(!data.ok)throw Error('Action rejected');await poll()}catch(e){error(e.message);show()}}
 document.addEventListener('click',e=>{
  if(!session||!started)return;
  const buy=e.target.closest('[data-buy]'),pass=e.target.closest('#passBtn'),advance=e.target.closest('#advanceBtn');
  const forbidden=e.target.closest('#newBtn,#returnSetupBtn,#deleteCurrentBtn,#deleteSavedBtn,#startBtn,#resumeBtn,[data-import-save]');
  if(!buy&&!pass&&!advance&&!forbidden)return;e.stopImmediatePropagation();e.preventDefault();
  if(forbidden){error('Offline controls are disabled during an online game.');show();return}
  if(buy||pass){if(snapshot?.queue?.[0]!==session.seat){error('Another studio is on the clock');show();return}submit(buy?{type:'buy',filmId:buy.dataset.buy}:{type:'pass'})}
  if(advance){if(session.seat!==0){error('Only the host can advance eras');show();return}submit({type:'advance'})}
 },true);
 document.addEventListener('change',e=>{
  if(!session||!started||!e.target.dataset.tv)return;
  e.stopImmediatePropagation();e.preventDefault();const pi=Number(e.target.dataset.player),filmId=e.target.dataset.tv,enabled=e.target.checked;e.target.checked=!enabled;
  if(pi!==session.seat){error('You cannot change another studio’s contracts');show();return}
  if(!enabled&&!confirm('A previously paying TV show may permanently close if it misses an eligible season. Continue?'))return;
  submit({type:'tv',playerIndex:pi,filmId,enabled});
 },true);
 if(localStorage.getItem(KEY)){open.textContent='🌐 Reconnect online';}
})();
