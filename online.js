/* Hollywood Empire V4.89: Github Pages / Supabase host-coordinated online beta.
   Server authenticates room seats and turns. Host browser executes the existing game engine.
   Not suitable for adversarial or prize-money competitive play. */
(()=>{'use strict';
 const bridge=window.HollywoodOnlineBridge;if(!bridge)return;
 const API='https://umrzadpfoylkgdcaauiu.supabase.co/functions/v1/he-room';
 const SCORE_API='https://umrzadpfoylkgdcaauiu.supabase.co/functions/v1/he-leaderboard';
 const eras=window.HollywoodGenreTest?.eras||[];
 const STUDIO_NAMES=['Silverlight Pictures','Crescent Peak Studios','Golden Lantern Films','Redwood Motion Pictures','Blue Horizon Studios','Summit Gate Pictures','Copper Reel Productions','Northstar Cinema','Marquee Hill Films','Aurora Frame Studios'];
 function shuffledStudioNames(){const names=STUDIO_NAMES.slice();for(let i=names.length-1;i>0;i--){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);const j=bytes[0]%(i+1);[names[i],names[j]]=[names[j],names[i]]}return names}
 const randomizedNames=shuffledStudioNames();
 const KEY='he-supabase-room-v1';
 let session=null,version=-1,snapshot=null,started=false,pendingId='',working=false,requesting=false,stopped=false;
 let seenError=null,leaderboardShown=false,resumeNeedsClose=false,submitting=false,lastStatus='';
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
 #heBotsConfig{padding:9px 11px;margin:8px 0 12px;border:1px solid #566881;border-radius:10px;background:#0c172a}
 #heBotsConfig .heAiRow{display:flex;align-items:center;gap:10px;margin:7px 0}
 #heBotsConfig .heAiRow label{flex:1;margin:0}
 #heBotsConfig .heAiRow select{flex:1;width:auto;margin:0}
 #heOnlineStatus{cursor:pointer}
 #heOnlineStatus.heWaiting{border-color:#55799f;background:#102d44f5}
 #heOnlineStatus.heMyTurn{border-color:#e2b96f;background:#27331cf5}
 #heOnlineStatus.hePending{border-color:#b18f59;background:#3c3022f5}
 #heScoresPrompt{position:fixed;left:12px;bottom:56px;z-index:9997;max-width:calc(100vw - 24px);background:#17283e;color:white;border:1px solid #e2b96f;border-radius:12px;padding:15px;box-shadow:0 8px 32px #0009;font:14px system-ui;display:none}
 #heScoresPrompt input{background:#0b1524;border:1px solid #647d9b;border-radius:8px;color:#fff;padding:8px;max-width:180px}
 #heScoresPrompt button{background:#e2b96f;color:#1b2230;border:0;border-radius:8px;padding:9px;margin:4px;font-weight:bold}
 #heOnlineStatus{position:fixed;bottom:12px;left:12px;max-width:82vw;z-index:9996;background:#142238f5;border:1px solid #b18f59;border-radius:10px;color:white;padding:8px;font:13px system-ui;display:none}
 `;document.head.append(style);
 const open=document.createElement('button');open.id='heOnlineOpen';open.textContent='🌐 Online game';
 const panel=document.createElement('div');panel.id='heOnlinePanel';panel.innerHTML=`<section id="heOnlineInner">
 <div style="display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0">🌐 Hollywood Empire Online</h2><button id="heOnlineClose" class="subtle">Close</button></div>
 <p>Create a room, join from another phone, and keep your reconnect key in this browser. The host's browser processes game turns.</p>
 <label>Studio name</label><input id="heName" maxlength="32" value="" /><button id="heRandomName" class="subtle" type="button">🎲 Random name</button>
 <button id="heCreate">Create room</button>
 <label>Join room code</label><input id="heCode" maxlength="6" placeholder="ABC234" autocapitalize="characters" />
 <button id="heJoin">Join room</button><button id="heReconnect" class="subtle">Reconnect</button>
 <div id="heRoom" style="display:none;border-top:1px solid #5b6a7f;margin-top:15px;padding-top:12px">
 <h3 id="heRoomTitle"></h3><p id="heRoomMembers"></p><p id="heTurn"></p>
 <div id="heHostSetup"><label>Starting era</label><select id="heStartEra"></select><label>Ending era</label><select id="heEndEra"></select><label>AI opponents (maximum four total studios)</label><select id="heBots"><option value="0">0 - Humans only</option><option value="1">1 AI studio</option><option value="2">2 AI studios</option><option value="3">3 AI studios</option></select><div id="heBotsConfig" aria-live="polite"></div><button id="heStart">Start game</button></div>
 </div><p id="heOnlineErr"></p>
 <p style="font-size:12px;color:#c7d1e1">Beta: The host must keep the game open to process moves. Server checks room and turn ownership, but game calculations run in the host browser. Offline saves are kept separately.</p>
 <button id="heStop" class="subtle">Disconnect (reload for offline save)</button></section>`;
 const status=document.createElement('div');status.id='heOnlineStatus';
 const scorePrompt=document.createElement('div');scorePrompt.id='heScoresPrompt';
 scorePrompt.innerHTML='<strong>🏆 Campaign completed — claim your Hollywood Empire result</strong><p>Your final studio score can be recorded in the Top 100.</p><label>Leaderboard player name <input id="heScoreName" maxlength="32" /></label> <button id="heClaimScore">Claim score</button> <button id="heHideScore">Later</button> <p id="heScoreMessage" style="margin:5px 0"></p><a style="color:#ffdb84" href="leaderboard.html" target="_blank">View Top 100</a>';
 document.body.append(open,panel,status,scorePrompt);
 const $=id=>document.getElementById(id),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 $('heName').value=randomizedNames[0];let nextNameIndex=1;
 $('heRandomName').onclick=()=>{$('heName').value=randomizedNames[nextNameIndex++%randomizedNames.length]};
 // These map to the existing game engine's bot difficulty identifiers.
 const AI_DIFFICULTIES=['easy','intermediate','hard'];
 function renderBotOptions(){
  const count=Number($('heBots').value)||0,holder=$('heBotsConfig');
  const previous=[...holder.querySelectorAll('select')].map(x=>x.value);
  holder.replaceChildren();holder.style.display=count?'block':'none';
  for(let i=0;i<count;i++){
   const row=document.createElement('div');row.className='heAiRow';
   const label=document.createElement('label');label.textContent=`AI studio ${i+1}`;label.htmlFor='heBotLevel'+i;
   const select=document.createElement('select');select.id='heBotLevel'+i;
   AI_DIFFICULTIES.forEach(level=>{const option=document.createElement('option');option.value=level;option.textContent=level.charAt(0).toUpperCase()+level.slice(1);select.append(option)});
   select.value=previous[i]||'intermediate';row.append(label,select);holder.append(row);
  }
 }
 $('heBots').onchange=renderBotOptions;renderBotOptions();
 for(let i=0;i<eras.length;i++){const label=eras[i].from===eras[i].to?''+eras[i].from:`${eras[i].from}–${eras[i].to}`;for(const id of ['heStartEra','heEndEra']){const el=document.createElement('option');el.value=String(i);el.textContent=label;$(id).append(el)}}$('heEndEra').value=String(eras.length-1);
 function error(s){$('heOnlineErr').textContent=String(s||'')}
 function show(){panel.classList.add('active')}function hide(){panel.classList.remove('active')}
 function updateTurnStatus(message,kind='waiting'){
  lastStatus=message;
  status.textContent=message;
  status.classList.toggle('heWaiting',kind==='waiting');
  status.classList.toggle('heMyTurn',kind==='mine');
  status.classList.toggle('hePending',kind==='pending');
  status.style.display='block';
 }
 status.title='Tap to open room details';status.onclick=show;
 open.onclick=show;$('heOnlineClose').onclick=hide;
 async function api(data){const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});let result;try{result=await response.json()}catch{throw Error('Supabase did not return JSON')}if(!response.ok||result.error)throw Error(result.error||'HTTP '+response.status);return result}
 async function send(op,extra={}){if(!session)throw Error('Not connected');return api({op,code:session.code,token:session.token,...extra})}
 function joinSession(data,isReconnecting=false){if(data.name)$('heName').value=data.name;session={code:data.code,token:data.token,seat:data.seat};localStorage.setItem(KEY,JSON.stringify(session));version=-1;seenError=null;started=false;leaderboardShown=false;resumeNeedsClose=isReconnecting;scorePrompt.style.display='none';window.__heOnlineActive=true;open.textContent='🌐 '+session.code;$('heRoom').style.display='block';error('');show();}
 async function createOrJoin(kind){try{error('Connecting…');const data=await api({op:kind,name:$('heName').value.trim(),code:$('heCode').value.trim().toUpperCase()});joinSession(data);await poll()}catch(e){error(e.message)}}
 $('heCreate').onclick=()=>createOrJoin('create');$('heJoin').onclick=()=>createOrJoin('join');
 $('heReconnect').onclick=async()=>{try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(!saved)throw Error('No reconnect key saved in this browser.');joinSession(saved,true);await poll()}catch(e){error(e.message)}};
 $('heStop').onclick=()=>{if(!confirm('Disconnect from the shared game? Reload to resume your separate offline save.'))return;session=null;window.__heOnlineActive=false;stopped=true;location.reload()};
 async function start(){if(!session||session.seat!==0)return;try{
  const bots=Number($('heBots').value),startTurn=Number($('heStartEra').value),endTurn=Number($('heEndEra').value);
  const levels=[...$('heBotsConfig').querySelectorAll('select')].map(x=>x.value);
  if(levels.length!==bots||levels.some(level=>!AI_DIFFICULTIES.includes(level)))throw Error('Choose a difficulty for each AI opponent');
  if(startTurn>endTurn)throw Error('End era must be after start era');
  const room=await send('poll');const names=room.members.map(x=>x.name);
  if(names.length+bots>4)throw Error('Maximum four studios, including AI');
  if(!confirm('Start online campaign? Any existing OFFLINE save remains untouched; online progress is stored in Supabase.'))return;
  // Only online UI has the right to initialize this game engine.
  window.__heOnlineActive=true;
  bridge.init({startTurn,endTurn,humans:names.length,bots,names});
  const initial=bridge.getSnapshot();
  // The game bridge uses the bot property for difficulty. Set it on the
  // canonical engine state before the room is started, never on a display copy.
  if(!initial||!Array.isArray(initial.players)||initial.players.length!==names.length+bots)
   throw Error('The game engine did not create the expected number of studios');
  for(let i=0;i<bots;i++)initial.players[names.length+i].bot=levels[i];
  bridge.setSnapshot(initial);
  const state=bridge.getSnapshot();
  for(let i=0;i<bots;i++)if(state.players[names.length+i].bot!==levels[i])
   throw Error('Could not configure AI difficulty for studio '+(i+1));
  await send('start',{state,bots});await poll();hide();
 }catch(e){error(e.message);show()}}
 $('heStart').onclick=start;
 async function hostAction(p){if(!session||session.seat!==0||working)return;working=true;try{
  if(p.type==='buy')bridge.action('buy',{filmId:p.filmId});
  else if(p.type==='pass')bridge.action('pass');
  else if(p.type==='advance')bridge.action('advance');
  else if(p.type==='tv')bridge.action('tv',{filmId:p.filmId,playerIndex:p.playerIndex,enabled:p.enabled});
  else throw Error('Unsupported action');
  await send('commit',{actionId:p.id,version,state:bridge.getSnapshot()});pendingId=p.id;
  updateTurnStatus('✓ Move recorded. Synchronizing studio turns…','pending');
  version=-1;await poll();
 }catch(e){
   try{await send('abort',{actionId:p.id,message:e.message})}catch{}
   error('Turn processing failed: '+e.message);
   updateTurnStatus('⚠ Move could not be recorded — resynchronizing…','pending');
   version=-1;await poll().catch(()=>{});
  }finally{working=false}}
 async function poll(){if(!session||requesting||stopped)return;requesting=true;try{
  const m=await send('poll',{since:version});
  const wasStarted=started;started=m.started;if(started&&!wasStarted)hide();$('heRoom').style.display='block';$('heRoomTitle').textContent=`Room ${m.code} · Your seat #${session.seat+1}`;
  $('heRoomMembers').innerHTML='<b>Studios:</b> '+m.members.map(x=>`#${x.seat+1} ${safe(x.name)}`).join(' · ');
  $('heHostSetup').style.display=(!started&&session.seat===0)?'block':'none';
  if(m.state){
   snapshot=m.state;version=m.version;window.__heOnlineActive=true;
   bridge.setSnapshot(snapshot);
  }else if(version<0){version=m.version}
  if(started&&resumeNeedsClose){hide();resumeNeedsClose=false}
  const who=snapshot?.queue?.[0];const turn=!started?'Waiting for host to start':snapshot?.complete?'Campaign finished':who==null?'All drafting done; host can advance':`On the clock: ${snapshot?.players?.[who]?.name||'Studio '+(who+1)}`;
  $('heTurn').textContent=turn;
  const mine=started&&!snapshot?.complete&&who===session.seat;
  const busy=Boolean(m.pending);
  const statusText=busy?'⏳ Recording the previous move…':mine?'🎬 YOUR TURN — '+(snapshot?.players?.[who]?.name||'Your studio'):
   started&&!snapshot?.complete?'⏳ Waiting — '+turn:turn;
  updateTurnStatus(`🌐 ${m.code} · Seat ${session.seat+1} · ${statusText}`,busy?'pending':mine?'mine':'waiting');
  if(m.lastError && m.lastError!==seenError){
   seenError=m.lastError;error('Last move was rejected: '+m.lastError);
   updateTurnStatus('⚠ Move rejected. The room is still connected; try again.','waiting');
  }else if(!m.lastError&&seenError){seenError=null;error('')}
  if(started && snapshot?.complete && snapshot?.players?.[session.seat]?.bot==='human' && !leaderboardShown){
   leaderboardShown=true;
   $('heScoreName').value=($('heName').value||snapshot.players[session.seat].name).slice(0,32);
   $('heScoreMessage').textContent='';scorePrompt.style.display='block';
  }
  if(m.pending && session.seat===0 && m.pending.id!==pendingId && !working){
   const task=m.pending;requesting=false;await hostAction(task);return;
  }
 }catch(e){
  error('Connection: '+e.message);
  updateTurnStatus('⚠ Connection interrupted — retrying automatically','waiting');
 }finally{requesting=false}}
 $('heHideScore').onclick=()=>{scorePrompt.style.display='none'};
 $('heClaimScore').onclick=async()=>{
  if(!session||!snapshot?.complete)return;
  $('heClaimScore').disabled=true;$('heScoreMessage').textContent='Saving completed result…';
  try{
   const response=await fetch(SCORE_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'claim',code:session.code,token:session.token,playerName:$('heScoreName').value})});
   const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Score recording failed');
   $('heScoreMessage').textContent=result.alreadyClaimed?'This game result was already saved.':'Your final result is recorded!';
  }catch(e){$('heScoreMessage').textContent='Could not save: '+e.message;$('heClaimScore').disabled=false}
 };
 setInterval(()=>{if(session&&!stopped)poll()},1700);
 async function submit(action){
 if(submitting)return;
 submitting=true;
 try{
  if(!session||!started)throw Error('The game has not started');
  updateTurnStatus('⏳ Submitting your move…','pending');
  const data=await send('submit',{version,action});
  if(!data.ok)throw Error('Action rejected');
  // Get the authoritative room version, not a local speculative game state.
  version=-1;await poll();
 }catch(e){
  error('Move not accepted: '+e.message);
  updateTurnStatus('⚠ Move not accepted. Resynchronizing…','pending');
  version=-1;await poll().catch(()=>{});
 }finally{submitting=false}
}
 document.addEventListener('click',e=>{
  if(!session||!started)return;
  const buy=e.target.closest('[data-buy]'),pass=e.target.closest('#passBtn'),advance=e.target.closest('#advanceBtn');
  const forbidden=e.target.closest('#newBtn,#returnSetupBtn,#deleteCurrentBtn,#deleteSavedBtn,#startBtn,#resumeBtn,[data-import-save]');
  if(!buy&&!pass&&!advance&&!forbidden)return;e.stopImmediatePropagation();e.preventDefault();
  if(forbidden){error('Offline controls are disabled during an online game.');return}
  if(buy||pass){if(submitting||snapshot?.queue?.[0]!==session.seat){updateTurnStatus('⏳ Waiting for your turn…','waiting');return}submit(buy?{type:'buy',filmId:buy.dataset.buy}:{type:'pass'})}
  if(advance){if(session.seat!==0){error('Only the host can advance eras');return}submit({type:'advance'})}
 },true);
 document.addEventListener('change',e=>{
  if(!session||!started||!e.target.dataset.tv)return;
  e.stopImmediatePropagation();e.preventDefault();const pi=Number(e.target.dataset.player),filmId=e.target.dataset.tv,enabled=e.target.checked;e.target.checked=!enabled;
  if(pi!==session.seat){error('You cannot change another studio’s contracts');return}
  if(!enabled&&!confirm('A previously paying TV show may permanently close if it misses an eligible season. Continue?'))return;
  submit({type:'tv',playerIndex:pi,filmId,enabled});
 },true);
 if(localStorage.getItem(KEY)){open.textContent='🌐 Reconnect online';}
})();
