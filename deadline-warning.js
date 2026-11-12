(function(){
  "use strict";
  const API="https://script.google.com/macros/s/AKfycbxTnLjon94xy4pum1O410O5pHHgjOk8FglMDtDFnteo6oJCttYX_Q3aV0_6xO15ocaEkA/exec";
  const HIDDEN_ASSIGNMENTS_KEY="uib-deadline-warning-hidden-assignments-v1";
  const FULLSCREEN_DISMISSED_KEY="uib-deadline-fullscreen-dismissed-v1";
  let dismissedThisVisit=false;
  let assignments=[],requestActive=false;
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function dateKey(date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");}
  function tomorrowKey(){const d=new Date();d.setDate(d.getDate()+1);return dateKey(d);}
  function dueTodayOrTomorrow(list){const today=dateKey(new Date()),tomorrow=tomorrowKey();return list.filter(x=>!x.done&&x.title&&(x.due===today||x.due===tomorrow)).sort((a,b)=>(a.due.localeCompare(b.due)||String(a.time||"23:59").localeCompare(String(b.time||"23:59"))));}
  function signature(list){return list.map(x=>[String(x.id||x.title),x.due,String(x.time||"23:59")].join("|")).sort().join("::");}
  function getHiddenAssignmentIds(){try{const value=JSON.parse(localStorage.getItem(HIDDEN_ASSIGNMENTS_KEY)||"[]");return Array.isArray(value)?value.map(String):[];}catch(e){return [];}}
  function isAssignmentHidden(id){return getHiddenAssignmentIds().includes(String(id));}
  function setAssignmentHidden(id,hidden){const ids=new Set(getHiddenAssignmentIds());if(hidden)ids.add(String(id));else ids.delete(String(id));try{localStorage.setItem(HIDDEN_ASSIGNMENTS_KEY,JSON.stringify(Array.from(ids)));}catch(e){}render();}
  function attachPopupPreference(popup,assignmentId){
    if(!popup||!assignmentId)return;
    const old=popup.querySelector(".uib-dw-popup-pref");
    if(old)old.remove();
    const label=document.createElement("label");
    label.className="uib-dw-popup-pref";
    label.innerHTML='<input type="checkbox"><span>Don\'t show notification again for this assignment</span>';
    const input=label.querySelector("input");
    input.checked=isAssignmentHidden(assignmentId);
    input.addEventListener("change",()=>setAssignmentHidden(assignmentId,input.checked));
    popup.appendChild(label);
  }
  function openNotificationAssignmentDetail(id){
    const item=assignments.find(x=>String(x.id)===String(id));
    if(!item)return;
    if(typeof window.openAssignmentDetail==="function"){
      window.openAssignmentDetail(id);
      const existing=document.querySelector("#assignmentDetailBackdrop .assignment-detail");
      if(existing)attachPopupPreference(existing,id);
      return;
    }
    let backdrop=document.getElementById("uib-dw-generic-backdrop");
    if(!backdrop){
      backdrop=document.createElement("div");
      backdrop.id="uib-dw-generic-backdrop";
      backdrop.className="uib-dw-generic-backdrop";
      backdrop.innerHTML='<section class="uib-dw-generic-popup" role="dialog" aria-modal="true" aria-labelledby="uibDwPopupTitle"><div class="assignment-detail-head"><div><h2 id="uibDwPopupTitle"></h2><div class="assignment-detail-course"></div></div><button class="assignment-detail-close" type="button" aria-label="Close assignment details">×</button></div><div class="assignment-detail-meta"><div><small>Deadline</small><strong data-field="deadline"></strong></div><div><small>Priority</small><strong data-field="priority"></strong></div><div><small>Status</small><strong data-field="status"></strong></div></div><div class="assignment-detail-description"><h3>Description / instructions</h3><p></p></div></section>';
      document.body.appendChild(backdrop);
      backdrop.querySelector(".assignment-detail-close").addEventListener("click",()=>{backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");});
      backdrop.addEventListener("click",e=>{if(e.target===backdrop){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");}});
      document.addEventListener("keydown",e=>{if(e.key==="Escape"){backdrop.classList.remove("open");backdrop.setAttribute("aria-hidden","true");}});
    }
    const due=parseDeadline(item);
    const today=new Date();
    const todayKey=dateKey(today);
    const status=item.done?"Completed":due<Date.now()?"Overdue":item.due===todayKey?"Due today":"Upcoming";
    const popup=backdrop.querySelector(".uib-dw-generic-popup");
    popup.querySelector("h2").textContent=item.title||"Untitled assignment";
    popup.querySelector(".assignment-detail-course").textContent=item.course||"Course not specified";
    popup.querySelector('[data-field="deadline"]').textContent=due.toLocaleString(undefined,{dateStyle:"full",timeStyle:"short"});
    popup.querySelector('[data-field="priority"]').textContent=item.priority||"Normal";
    popup.querySelector('[data-field="status"]').textContent=status;
    popup.querySelector(".assignment-detail-description p").textContent=item.description||"No description has been added for this assignment.";
    attachPopupPreference(popup,id);
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden","false");
    backdrop.querySelector(".assignment-detail-close").focus();
  }

  function ensureStyles(){if(document.getElementById("uib-deadline-warning-style"))return;const style=document.createElement("style");style.id="uib-deadline-warning-style";style.textContent=`
   #uib-deadline-warning{position:fixed;z-index:99990;top:auto;right:calc(18px + var(--site-menu-scrollbar-width,0px));bottom:18px;width:min(390px,calc(100vw - 36px));box-sizing:border-box;padding:16px 48px 16px 17px;border:1px solid rgba(202,133,35,.34);border-left:4px solid #d58a25;border-radius:15px;background:var(--surface,#fff);color:var(--ink,#202536);box-shadow:0 14px 42px rgba(20,25,40,.2);font:inherit;animation:uibDeadlineIn .24s ease-out}
   #uib-deadline-warning[hidden]{display:none!important}
   #uib-deadline-warning .uib-dw-kicker{display:block;margin-bottom:5px;color:#b36b13;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
   #uib-deadline-warning .uib-dw-title{display:block;margin:0 0 7px;font-size:15px;line-height:1.35;font-weight:800}
   #uib-deadline-warning .uib-dw-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
   #uib-deadline-warning .uib-dw-list li{font-size:13px;line-height:1.4;overflow-wrap:anywhere}#uib-deadline-warning .uib-dw-item{padding:5px 7px;margin:0 -7px;border-radius:8px;cursor:pointer}#uib-deadline-warning .uib-dw-item:hover,#uib-deadline-warning .uib-dw-item:focus-visible{background:rgba(128,128,128,.12);outline:none}
   #uib-deadline-warning .uib-dw-list small{display:block;margin-top:1px;color:var(--muted,#737b8e);font-size:11px}
   #uib-deadline-warning .uib-dw-footer{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-top:12px;padding:10px 2px 0;border-top:1px solid rgba(128,128,128,.16)}
   #uib-deadline-warning .uib-dw-never{display:inline-flex;align-items:center;gap:8px;margin:0;color:var(--muted,#737b8e);font-size:12px;line-height:1.4;cursor:pointer;user-select:none}
   #uib-deadline-warning .uib-dw-never input{width:14px;height:14px;margin:0;accent-color:#b7791f}
   #uib-deadline-warning .uib-dw-close{position:absolute;top:10px;right:10px;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted,#737b8e);font:inherit;font-size:22px;line-height:1;cursor:pointer}
   #uib-deadline-warning .uib-dw-close:hover{background:rgba(128,128,128,.13);color:var(--ink,#202536)}
   .uib-dw-fullscreen{position:fixed;inset:0;z-index:1000000;display:grid;place-items:center;box-sizing:border-box;width:100vw;height:100vh;height:100dvh;padding:clamp(12px,3vw,34px);overflow:auto;background:radial-gradient(ellipse at 50% 0%,#5b1724 0,#190b15 58%,#090910 100%);color:#fff; font:inherit}
   .uib-dw-fullscreen[hidden]{display:none!important}
   .uib-dw-fullscreen-inner{position:relative;width:min(920px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:clamp(20px,4vw,42px);border:2px solid #ff6675;border-radius:clamp(16px,3vw,28px);background:linear-gradient(145deg,#30131d,#17121e 72%);box-shadow:0 0 0 1px #ff667533,0 24px 100px #000b,0 0 70px #e52d4b33}
   .uib-dw-fullscreen-kicker{display:block;color:#ffb2bb;font-size:clamp(11px,1.5vw,14px);font-weight:900;letter-spacing:.2em;text-transform:uppercase}
   .uib-dw-fullscreen h2{margin:10px 0 6px;color:#fff;font-size:clamp(34px,7vw,68px);font-weight:1000;letter-spacing:-.055em;line-height:.98;text-transform:uppercase;text-shadow:0 5px 26px #ff334855}
   .uib-dw-fullscreen-lead{margin:0 0 22px;color:#ffdce0;font-size:clamp(14px,2vw,19px);font-weight:700}
   .uib-dw-fullscreen-item{margin-top:14px;padding:clamp(15px,2.5vw,24px);border:1px solid #ff899477;border-radius:16px;background:#ffffff0b}
   .uib-dw-fullscreen-item h3{margin:0 0 5px;color:#fff;font-size:clamp(20px,3vw,28px);line-height:1.2;overflow-wrap:anywhere}
   .uib-dw-fullscreen-meta{display:flex;flex-wrap:wrap;gap:7px 16px;margin:8px 0 13px;color:#ffc3ca;font-size:13px;font-weight:750}
   .uib-dw-fullscreen-desc{margin:0;color:#fff0f1;font-size:clamp(14px,1.8vw,17px);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
   .uib-dw-fullscreen-empty{color:#ffc3ca;font-style:italic}
   .uib-dw-fullscreen-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:24px}
   .uib-dw-fullscreen-actions button,.uib-dw-fullscreen-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 20px;border:1px solid #ff9ba5;border-radius:12px;background:#ff6575;color:#210910;font:800 14px inherit;text-decoration:none;cursor:pointer}
   .uib-dw-fullscreen-actions a{background:transparent;color:#fff;border-color:#ffffff55}
   @media(max-width:600px){.uib-dw-fullscreen{padding:10px}.uib-dw-fullscreen-inner{padding:20px 16px;border-radius:17px}.uib-dw-fullscreen-actions{display:grid;grid-template-columns:1fr}.uib-dw-fullscreen-actions button,.uib-dw-fullscreen-actions a{width:100%}}
   @media(prefers-reduced-motion:reduce){.uib-dw-fullscreen-inner{animation:none!important}}
   @keyframes uibDeadlineIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
   @media(max-width:600px){#uib-deadline-warning{top:auto;right:10px;bottom:10px;width:calc(100vw - 20px);padding:14px 44px 14px 14px;border-radius:13px}}
   @media(prefers-reduced-motion:reduce){#uib-deadline-warning{animation:none}}
    .uib-dw-generic-backdrop{position:fixed;inset:0;z-index:99995;display:none;place-items:center;padding:18px;background:#0a1020a8;backdrop-filter:blur(5px)}
    .uib-dw-generic-backdrop.open{display:grid}
    .uib-dw-generic-popup{position:relative;width:min(560px,100%);max-height:min(82vh,760px);overflow:auto;background:var(--surface,#fff);color:var(--ink,#202536);border:1px solid var(--line,rgba(128,128,128,.2));border-radius:20px;padding:22px;box-shadow:0 24px 80px #0005}
    .uib-dw-generic-popup .assignment-detail-head{display:flex;align-items:flex-start;gap:12px;padding-right:44px}
    .uib-dw-generic-popup h2{font-size:22px;line-height:1.25;margin:0 0 6px}
    .uib-dw-generic-popup .assignment-detail-close{position:absolute;top:18px;right:18px;display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--line,rgba(128,128,128,.2));border-radius:50%;background:var(--surface2,#f4f5f8);color:var(--ink,#202536);font-size:20px;cursor:pointer}
    .uib-dw-generic-popup .assignment-detail-meta{display:grid;grid-template-columns:1fr 1fr;column-gap:12px;row-gap:12px;margin:18px 0}
    .uib-dw-generic-popup .assignment-detail-meta div{display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px 13px;border:1px solid var(--line,rgba(128,128,128,.2));border-radius:12px;background:var(--surface2,#f4f5f8)}
    .uib-dw-generic-popup .assignment-detail-meta small{display:block;color:var(--muted,#737b8e);font-size:11px;line-height:1.35}
    .uib-dw-generic-popup .assignment-detail-meta strong{display:block;font-size:13px;line-height:1.45;margin:0;overflow-wrap:anywhere}
    #assignmentDetailBackdrop .uib-dw-popup-pref,.uib-dw-generic-popup .uib-dw-popup-pref{display:flex!important;flex-direction:row!important;align-items:flex-start!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;margin:16px 0 0!important;padding:14px 0 0!important;border:0!important;border-top:1px solid var(--line,rgba(128,128,128,.2))!important;border-radius:0!important;background:transparent!important;font-family:inherit!important;font-size:13px!important;line-height:1.5!important;font-weight:500!important;color:var(--muted,#737b8e)!important;text-align:left!important;white-space:normal!important;overflow-wrap:anywhere!important;cursor:pointer;user-select:none}
    #assignmentDetailBackdrop .uib-dw-popup-pref input,.uib-dw-generic-popup .uib-dw-popup-pref input{display:block!important;position:static!important;flex:0 0 16px!important;width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;margin:2px 0 0!important;padding:0!important;border:initial!important;border-radius:3px!important;box-shadow:none!important;background:initial!important;accent-color:#b7791f;cursor:pointer}
    #assignmentDetailBackdrop .uib-dw-popup-pref span,.uib-dw-generic-popup .uib-dw-popup-pref span{display:block!important;flex:1 1 auto!important;min-width:0!important;margin:0!important;padding:0!important;font-size:13px!important;line-height:1.5!important;font-weight:500!important;white-space:normal!important;overflow-wrap:anywhere!important}
    @media(max-width:500px){.uib-dw-generic-popup{padding:18px}}
  `;document.head.appendChild(style);}
  function parseDeadline(item){
    const raw=String(item&&item.due||"").trim(),time=String(item&&item.time||"23:59").trim();
    const tm=time.match(/^(\\d{1,2}):(\\d{2})/),hour=tm?Math.min(23,Number(tm[1])):23,minute=tm?Math.min(59,Number(tm[2])):59;
    let m=raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
    if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),hour,minute,0,0);
    m=raw.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})$/);
    if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),hour,minute,0,0);
    const parsed=new Date(raw);
    if(!Number.isFinite(parsed.getTime()))return new Date(NaN);
    if(raw.includes("T"))return parsed;
    return new Date(parsed.getFullYear(),parsed.getMonth(),parsed.getDate(),hour,minute,0,0);
  }
  function deadlineDismissedKeys(){try{const v=JSON.parse(localStorage.getItem(FULLSCREEN_DISMISSED_KEY)||"[]");return new Set(Array.isArray(v)?v.map(String):[])}catch(e){return new Set()}}
  function deadlineKey(x){return String(x.id||x.title)+"|"+String(x.due)+"|"+String(x.time||"23:59")}
  function finalHourAssignments(){
    const now=Date.now();
    return assignments.filter(x=>!x.done&&x.id&&x.due).map(x=>({item:x,due:parseDeadline(x)})).filter(v=>{
      const left=v.due.getTime()-now;
      return Number.isFinite(v.due.getTime())&&left>0&&left<=3600000;
    }).sort((a,b)=>a.due-b.due);
  }
  function dismissFinalHourWarning(){
    const dismissed=deadlineDismissedKeys();
    finalHourAssignments().forEach(v=>dismissed.add(deadlineKey(v.item)));
    try{localStorage.setItem(FULLSCREEN_DISMISSED_KEY,JSON.stringify(Array.from(dismissed)))}catch(e){}
    const overlay=document.getElementById("uib-dw-fullscreen");
    if(overlay){overlay.hidden=true;overlay.setAttribute("aria-hidden","true")}
  }
  function renderFinalHourWarning(){
    if(!document.body)return;
    let overlay=document.getElementById("uib-dw-fullscreen");
    if(!overlay){
      ensureStyles();
      overlay=document.createElement("section");
      overlay.id="uib-dw-fullscreen";
      overlay.className="uib-dw-fullscreen";
      overlay.hidden=true;
      overlay.setAttribute("role","alertdialog");
      overlay.setAttribute("aria-modal","true");
      overlay.setAttribute("aria-labelledby","uib-dw-fullscreen-title");
      overlay.innerHTML='<div class="uib-dw-fullscreen-inner"><span class="uib-dw-fullscreen-kicker">UIB Assignment Tracker · Final hour warning</span><h2 id="uib-dw-fullscreen-title">ONE HOUR LEFT</h2><p class="uib-dw-fullscreen-lead"></p><div class="uib-dw-fullscreen-items"></div><div class="uib-dw-fullscreen-actions"><a href="assignments.html">Open assignment tracker</a><button type="button">I understand · dismiss warning</button></div></div>';
      overlay.querySelector("button").addEventListener("click",dismissFinalHourWarning);
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&overlay&&!overlay.hidden)dismissFinalHourWarning()});
      document.body.appendChild(overlay);
    }
    const dismissed=deadlineDismissedKeys();
    const urgent=finalHourAssignments().filter(v=>!dismissed.has(deadlineKey(v.item)));
    if(!urgent.length){overlay.hidden=true;overlay.setAttribute("aria-hidden","true");return}
    const format=v=>v.toLocaleString(undefined,{dateStyle:"full",timeStyle:"short"});
    overlay.querySelector(".uib-dw-fullscreen-lead").textContent=urgent.length===1?"This assignment is due in less than one hour. Check the instructions and submit before time runs out.":urgent.length+" assignments are due within the next hour. Review every instruction below.";
    overlay.querySelector(".uib-dw-fullscreen-items").innerHTML=urgent.map(v=>{
      const x=v.item;
      return '<article class="uib-dw-fullscreen-item"><h3>'+esc(x.title||"Untitled assignment")+'</h3><div class="uib-dw-fullscreen-meta"><span>'+esc(x.course||"Course not specified")+'</span><span>Priority: '+esc(x.priority||"Normal")+'</span><span>Due: '+esc(format(v.due))+'</span></div><p class="uib-dw-fullscreen-desc">'+(x.description?esc(x.description):'<span class="uib-dw-fullscreen-empty">No description or instructions have been added.</span>')+'</p></article>';
    }).join("");
    overlay.hidden=false;
    overlay.setAttribute("aria-hidden","false");
    const close=overlay.querySelector("button");
    if(document.activeElement!==close)close.focus({preventScroll:true});
  }
  function ensureNotice(){let box=document.getElementById("uib-deadline-warning");if(box)return box;ensureStyles();box=document.createElement("aside");box.id="uib-deadline-warning";box.hidden=true;box.setAttribute("role","alert");box.setAttribute("aria-live","polite");box.innerHTML='<button class="uib-dw-close" type="button" aria-label="Close deadline warning">×</button><span class="uib-dw-kicker">Assignment reminder</span><strong class="uib-dw-title">Deadline tomorrow</strong><ul class="uib-dw-list"></ul>';box.querySelector(".uib-dw-close").addEventListener("click",()=>{dismissedThisVisit=true;box.hidden=true;});const openRow=row=>{if(row)openNotificationAssignmentDetail(row.dataset.assignmentId);};box.querySelector(".uib-dw-list").addEventListener("click",e=>openRow(e.target.closest("[data-assignment-id]")));box.querySelector(".uib-dw-list").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-assignment-id]")){e.preventDefault();openRow(e.target);}});document.body.appendChild(box);return box;}
  function render(){if(!document.body)return;const box=ensureNotice();renderFinalHourWarning();const upcoming=dueTodayOrTomorrow(assignments).filter(x=>!isAssignmentHidden(x.id));if(!upcoming.length||dismissedThisVisit){box.hidden=true;return;}const today=dateKey(new Date()),todayCount=upcoming.filter(x=>x.due===today).length,tomorrowCount=upcoming.length-todayCount;const key=signature(upcoming);box.dataset.signature=key;box.querySelector(".uib-dw-title").textContent=todayCount&&tomorrowCount?todayCount+" due today · "+tomorrowCount+" due tomorrow":todayCount?(todayCount===1?"1 assignment is due today":todayCount+" assignments are due today"):(tomorrowCount===1?"1 assignment is due tomorrow":tomorrowCount+" assignments are due tomorrow");box.querySelector(".uib-dw-list").innerHTML=upcoming.slice(0,4).map(x=>'<li class="uib-dw-item" data-assignment-id="'+esc(x.id)+'" tabindex="0" role="button"><strong>'+esc(x.title)+'</strong><small>'+esc(x.course||"")+(x.course?" · ":"")+(x.due===today?"Due today":"Due tomorrow")+" · "+esc(x.time||"23:59")+'</small></li>').join("")+(upcoming.length>4?'<li>+'+(upcoming.length-4)+' more assignment(s)</li>':"");box.hidden=false;}
  function load(){if(requestActive)return;requestActive=true;const callback="uibDeadlineWarning_"+Date.now()+"_"+Math.random().toString(36).slice(2);const script=document.createElement("script");let settled=false;const timeout=setTimeout(finish,12000);function finish(){if(settled)return;settled=true;requestActive=false;clearTimeout(timeout);try{delete window[callback];}catch(e){window[callback]=undefined;}script.remove();}window[callback]=data=>{if(settled)return;assignments=data&&data.ok&&Array.isArray(data.assignments)?data.assignments:[];finish();render();checkFinalHourNotifications();};script.onerror=()=>{finish();};script.src=API+"?action=assignments&callback="+encodeURIComponent(callback)+"&_="+Date.now();document.head.appendChild(script);}
  function checkFinalHourNotifications(){
    if(!("Notification"in window)||Notification.permission!=="granted")return;
    const now=Date.now(),windowMs=3*3600000,repeatMs=10*60000;
    assignments.filter(x=>!x.done&&x.id&&x.due).forEach(x=>{
      const due=parseDeadline(x).getTime(),remaining=due-now;
      if(!Number.isFinite(due)||remaining<=0||remaining>windowMs)return;
      const key="uib-assignment-final-reminder-"+String(x.id)+"-"+x.due+"-"+(x.time||"23:59");
      let last=0;try{last=Number(localStorage.getItem(key)||0);}catch(e){}
      if(last&&now-last<repeatMs)return;
      const mins=Math.max(1,Math.ceil(remaining/60000)),left=mins>=60?Math.floor(mins/60)+"h "+(mins%60)+"m":mins+"m";
      try{
        new Notification("⏰ Deadline in "+left+": "+(x.title||"Assignment"),{
          body:(x.course||"Assignment")+" · Due "+new Date(due).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}),
          tag:"uib-assignment-"+x.id,renotify:true
        });
        try{localStorage.setItem(key,String(now));}catch(e){}
      }catch(e){}
    });
  }
  function start(){ensureNotice();load();setInterval(load,60000);setInterval(render,30000);setInterval(checkFinalHourNotifications,30000);setInterval(renderFinalHourWarning,10000);window.addEventListener("storage",e=>{if(e.key===HIDDEN_ASSIGNMENTS_KEY)render();});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();