/* Hollywood Empire online: server-driven room state; offline mode is unchanged. */
(() => {
  'use strict';
  const bridge = window.HollywoodOnlineBridge;
  if (!bridge) return;
  const css = document.createElement('style');
  css.textContent = `
    #heOnlineOpen {position:fixed;top:10px;right:10px;z-index:9998;background:#dfb66e;color:#152037;border:2px solid #152037;border-radius:12px;padding:9px 13px;font-weight:bold;box-shadow:0 4px 22px #0007;font-size:14px}
    #heOnlinePanel {position:fixed;inset:0;background:#050b16e9;z-index:9999;display:none;overflow:auto;padding:30px 12px}
    #heOnlinePanel.visible {display:block}
    #heOnlineBox {max-width:500px;margin:auto;background:#152034;border:1px solid #a98c55;border-radius:18px;padding:22px;color:#ecf1ff;font:16px system-ui,sans-serif}
    #heOnlineBox input,#heOnlineBox select {background:#0b1323;color:#fff;padding:10px;border:1px solid #60728f;border-radius:7px;max-width:100%;width:100%;margin:5px 0 12px}
    #heOnlineBox button {padding:10px 13px;border-radius:8px;margin:4px;background:#d5ae69;color:#162137;font-weight:bold;border:0}
    #heOnlineBox button.subtle {background:#293a50;color:#f6f8ff}
    #heOnlineBox label {display:block;font-size:13px;margin-top:8px}
    #heOnlineStatus {position:fixed;bottom:12px;left:12px;z-index:9998;background:#172437ed;border:1px solid #8c7549;color:#fff;border-radius:10px;padding:10px;font:13px system-ui;max-width:300px;display:none}
    #heOnlineBox .error {color:#ffb9a9;min-height:22px}
  `;
  document.head.append(css);
  const btn = document.createElement('button'); btn.id='heOnlineOpen'; btn.textContent='🌐 Online multiplayer';
  const panel = document.createElement('div');panel.id='heOnlinePanel';
  panel.innerHTML=`<section id="heOnlineBox">
  <div style="display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0">🌐 Online multiplayer</h2><button type="button" class="subtle" id="heOnlineClose">Close</button></div>
  <p>One shared game across phones. Every player gets a studio seat and a private reconnect key.</p>
  <label>Your studio name</label><input id="heName" value="Silverlight Pictures" maxlength="32">
  <button id="heCreate">Create room</button>
  <label>Join existing room (6-character code)</label><input id="heCode" maxlength="6" placeholder="ABC234" autocomplete="off">
  <button id="heJoin">Join room</button><button id="heReconnect" class="subtle">Reconnect saved room</button>
  <div id="heRoomDetails" style="display:none;margin-top:15px;border-top:1px solid #586275;padding-top:12px">
    <h3 id="heRoomCode"></h3><p id="heMembers"></p><p id="heTurn"></p>
    <div id="heHostStart"><p>Host: choose the campaign range and number of AI studios. Other humans must join before starting.</p>
      <label>Start era</label><select id="heStartEra"></select><label>End era</label><select id="heEndEra"></select>
      <label>AI opponents (total studios maximum 4)</label><select id="heBots"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      <button id="heStart">Start shared game</button>
    </div>
    <p style="font-size:12px;color:#b8c5d9">Game data is stored on the online server. Keep your reconnect key in this browser. The first player is the host and advances completed eras.</p>
  </div><p class="error" id="heError"></p>
  <button id="heOffline" class="subtle">Use offline game instead</button>
  </section>`;
  const status=document.createElement('div'); status.id='heOnlineStatus';
  document.body.append(btn,panel,status);
  const el=id=>document.getElementById(id);
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const series=window.HollywoodGenreTest?.eras||[];
  series.forEach((e,i)=>{const txt=e.from===e.to?String(e.from):`${e.from}–${e.to}`;for(const id of ['heStartEra','heEndEra']){const x=document.createElement('option');x.value=i;x.textContent=txt;el(id).append(x)}});
  el('heStartEra').value='0';el('heEndEra').value=String(Math.max(0,series.length-1));
  let ws=null,online=false,seat=null,code=null,version=0,latest=null,started=false;
  const roomKey='hollywood-empire-online-room';
  function error(message){el('heError').textContent=String(message||'');}
  function show(){panel.classList.add('visible')}
  function hide(){panel.classList.remove('visible')}
  btn.onclick=show;el('heOnlineClose').onclick=hide;
  el('heOffline').onclick=()=>{if(online){if(!confirm('Disconnect from online room and use local offline play?'))return;online=false;ws?.close()}status.style.display='none';btn.textContent='🌐 Online multiplayer';hide()};
  function connect(payload){
    if(ws && ws.readyState<2)ws.close();
    error('Connecting…');
    const scheme=location.protocol==='https:'?'wss:':'ws:';
    ws=new WebSocket(`${scheme}//${location.host}/ws`);
    ws.onopen=()=>ws.send(JSON.stringify(payload));
    ws.onclose=()=>{if(online){error('Connection lost. Use Reconnect saved room.');status.textContent='⚠ Offline: reconnect to continue';status.style.display='block'}};
    ws.onerror=()=>error('Network unavailable. Confirm the server is deployed and reachable.');
    ws.onmessage=e=>{
      let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='error'){error(m.message);return}
      if(m.type==='welcome'){
        online=true;seat=m.seat;code=m.code;
        localStorage.setItem(roomKey,JSON.stringify({code:m.code,token:m.token}));
        btn.textContent=`🌐 Room ${code}`;
        error('');
      }
      if(m.type==='state'){
        latest=m.state;version=m.version;started=m.started;
        el('heRoomDetails').style.display='block';
        el('heRoomCode').textContent=`Room ${safe(m.code)} · You are studio #${seat+1}`;
        el('heMembers').innerHTML=`<strong>Joined:</strong> ${m.members.map(x=>`#${x.seat+1} ${safe(x.name)}`).join(' · ')}`;
        el('heHostStart').style.display=(!started&&seat===0)?'block':'none';
        if(m.state){
          bridge.setSnapshot(m.state);
          const turn=(m.state.queue||[])[0];
          el('heTurn').textContent=m.state.complete?'Campaign complete':turn==null?'All picks complete: host may advance':`Now drafting: ${m.state.players[turn]?.name} (#${turn+1})`;
          status.textContent=`🌐 ${code} · Your studio #${seat+1} · ${el('heTurn').textContent}`;
          status.style.display='block';
          hide();
        }else{
          el('heTurn').textContent='Waiting for the host to start the shared game.';
          status.textContent=`🌐 Room ${code} · waiting to start`;
          status.style.display='block';
        }
      }
    };
  }
  el('heCreate').onclick=()=>connect({type:'create',name:el('heName').value});
  el('heJoin').onclick=()=>connect({type:'join',code:el('heCode').value.toUpperCase(),name:el('heName').value});
  el('heReconnect').onclick=()=>{
    let saved;try{saved=JSON.parse(localStorage.getItem(roomKey)||'null')}catch{}
    if(!saved){error('No saved room for this browser. Use the six-character code to join before the game starts.');return}
    connect({type:'resume',...saved});
  };
  el('heStart').onclick=()=>send({type:'start',startTurn:+el('heStartEra').value,endTurn:+el('heEndEra').value,bots:+el('heBots').value});
  function send(payload){if(!ws||ws.readyState!==WebSocket.OPEN){error('Not connected');show();return}ws.send(JSON.stringify({...payload,version}));}
  /* Capture state-changing UI actions before the original local game handlers run.
     Server runs the canonical game; no local purchase, finance or contract write is trusted. */
  document.addEventListener('click',e=>{
    if(!online)return;
    const buy=e.target.closest('[data-buy]'),pass=e.target.closest('#passBtn'),advance=e.target.closest('#advanceBtn');
    const forbidden=e.target.closest('#newBtn,#returnSetupBtn,#deleteCurrentBtn,#deleteSavedBtn,#startBtn,#resumeBtn,[data-import-save]');
    if(!buy&&!pass&&!advance&&!forbidden)return;
    e.stopImmediatePropagation();e.preventDefault();
    if(forbidden){error('Shared rooms use the online lobby. Offline save controls cannot change a shared game.');show();return}
    if(!started){error('The host must start the room before anyone can draft.');show();return}
    if(buy||pass){
      if(latest?.queue?.[0]!==seat){error('It is not your studio’s turn.');show();return}
      send(buy?{type:'buy',filmId:buy.dataset.buy}:{type:'pass'});
    }else if(advance){
      if(seat!==0){error('Only the room host can advance a completed era.');show();return}
      send({type:'advance'});
    }
  },true);
  document.addEventListener('change',e=>{
    if(!online||!started||!e.target.dataset.tv)return;
    e.stopImmediatePropagation();e.preventDefault();
    const pi=Number(e.target.dataset.player),filmId=e.target.dataset.tv,enabled=e.target.checked;
    e.target.checked=!enabled;
    if(pi!==seat){error('Only the owner can change this contract.');show();return}
    if(!enabled && !confirm('Turning off a previously earning TV deal may permanently cancel a paying season. Continue?'))return;
    send({type:'tv',playerIndex:pi,filmId,enabled});
  },true);
  if(localStorage.getItem(roomKey))btn.textContent='🌐 Reconnect online game';
})();
