(function(){
  "use strict";
  const API="https://script.google.com/macros/s/AKfycbxTnLjon94xy4pum1O410O5pHHgjOk8FglMDtDFnteo6oJCttYX_Q3aV0_6xO15ocaEkA/exec";
  const DISMISSED_KEY="uib-deadline-warning-dismissed-v1";
  let assignments=[],requestActive=false;
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function dateKey(date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");}
  function tomorrowKey(){const d=new Date();d.setDate(d.getDate()+1);return dateKey(d);}
  function dueTomorrow(list){const key=tomorrowKey();return list.filter(x=>!x.done&&x.title&&x.due===key).sort((a,b)=>String(a.time||"23:59").localeCompare(String(b.time||"23:59")));}
  function signature(list){return list.map(x=>[String(x.id||x.title),x.due,String(x.time||"23:59")].join("|")).sort().join("::");}
  function dismissed(){try{return JSON.parse(localStorage.getItem(DISMISSED_KEY)||"[]");}catch(e){return[];}}
  function saveDismissed(value){try{const keep=dismissed().filter(x=>x!==value);keep.push(value);localStorage.setItem(DISMISSED_KEY,JSON.stringify(keep.slice(-30)));}catch(e){}}
  function ensureStyles(){if(document.getElementById("uib-deadline-warning-style"))return;const style=document.createElement("style");style.id="uib-deadline-warning-style";style.textContent=`
   #uib-deadline-warning{position:fixed;z-index:99990;top:18px;right:18px;width:min(390px,calc(100vw - 36px));box-sizing:border-box;padding:16px 48px 16px 17px;border:1px solid rgba(202,133,35,.34);border-left:4px solid #d58a25;border-radius:15px;background:var(--surface,#fff);color:var(--ink,#202536);box-shadow:0 14px 42px rgba(20,25,40,.2);font:inherit;animation:uibDeadlineIn .24s ease-out}
   #uib-deadline-warning[hidden]{display:none!important}
   #uib-deadline-warning .uib-dw-kicker{display:block;margin-bottom:5px;color:#b36b13;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
   #uib-deadline-warning .uib-dw-title{display:block;margin:0 0 7px;font-size:15px;line-height:1.35;font-weight:800}
   #uib-deadline-warning .uib-dw-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
   #uib-deadline-warning .uib-dw-list li{font-size:13px;line-height:1.4;overflow-wrap:anywhere}
   #uib-deadline-warning .uib-dw-list small{display:block;margin-top:1px;color:var(--muted,#737b8e);font-size:11px}
   #uib-deadline-warning .uib-dw-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted,#737b8e);font:inherit;font-size:22px;line-height:1;cursor:pointer}
   #uib-deadline-warning .uib-dw-close:hover{background:rgba(128,128,128,.13);color:var(--ink,#202536)}
   @keyframes uibDeadlineIn{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:translateY(0)}}
   @media(max-width:600px){#uib-deadline-warning{top:10px;right:10px;width:calc(100vw - 20px);padding:14px 44px 14px 14px;border-radius:13px}}
   @media(prefers-reduced-motion:reduce){#uib-deadline-warning{animation:none}}
  `;document.head.appendChild(style);}
  function ensureNotice(){let box=document.getElementById("uib-deadline-warning");if(box)return box;ensureStyles();box=document.createElement("aside");box.id="uib-deadline-warning";box.hidden=true;box.setAttribute("role","alert");box.setAttribute("aria-live","polite");box.innerHTML='<button class="uib-dw-close" type="button" aria-label="Close deadline warning">×</button><span class="uib-dw-kicker">Assignment reminder</span><strong class="uib-dw-title">Deadline tomorrow</strong><ul class="uib-dw-list"></ul>';box.querySelector("button").addEventListener("click",()=>{if(box.dataset.signature)saveDismissed(box.dataset.signature);box.hidden=true;});document.body.appendChild(box);return box;}
  function render(){if(!document.body)return;const box=ensureNotice(),upcoming=dueTomorrow(assignments);if(!upcoming.length){box.hidden=true;return;}const key=signature(upcoming);if(dismissed().includes(key)){box.hidden=true;return;}box.dataset.signature=key;box.querySelector(".uib-dw-title").textContent=upcoming.length===1?"1 assignment is due tomorrow":upcoming.length+" assignments are due tomorrow";box.querySelector(".uib-dw-list").innerHTML=upcoming.slice(0,4).map(x=>'<li><strong>'+esc(x.title)+'</strong><small>'+esc(x.course||"")+(x.course?" · ":"")+"Due "+esc(x.time||"23:59")+'</small></li>').join("")+(upcoming.length>4?'<li>+'+(upcoming.length-4)+' more assignment(s)</li>':"");box.hidden=false;}
  function load(){if(requestActive)return;requestActive=true;const callback="uibDeadlineWarning_"+Date.now()+"_"+Math.random().toString(36).slice(2);const script=document.createElement("script");let settled=false;const timeout=setTimeout(finish,12000);function finish(){if(settled)return;settled=true;requestActive=false;clearTimeout(timeout);try{delete window[callback];}catch(e){window[callback]=undefined;}script.remove();}window[callback]=data=>{if(settled)return;assignments=data&&data.ok&&Array.isArray(data.assignments)?data.assignments:[];finish();render();};script.onerror=()=>{finish();};script.src=API+"?action=assignments&callback="+encodeURIComponent(callback)+"&_="+Date.now();document.head.appendChild(script);}
  function start(){ensureNotice();load();setInterval(load,60000);setInterval(render,30000);window.addEventListener("storage",e=>{if(e.key===DISMISSED_KEY)render();});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();