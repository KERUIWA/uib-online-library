(function(){
  "use strict";
  const API="https://script.google.com/macros/s/AKfycbxTnLjon94xy4pum1O410O5pHHgjOk8FglMDtDFnteo6oJCttYX_Q3aV0_6xO15ocaEkA/exec";
  const HIDDEN_ASSIGNMENTS_KEY="uib-deadline-warning-hidden-assignments-v1";
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
    const due=new Date(item.due+"T"+(item.time||"23:59")+":00");
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
  function ensureNotice(){let box=document.getElementById("uib-deadline-warning");if(box)return box;ensureStyles();box=document.createElement("aside");box.id="uib-deadline-warning";box.hidden=true;box.setAttribute("role","alert");box.setAttribute("aria-live","polite");box.innerHTML='<button class="uib-dw-close" type="button" aria-label="Close deadline warning">×</button><span class="uib-dw-kicker">Assignment reminder</span><strong class="uib-dw-title">Deadline tomorrow</strong><ul class="uib-dw-list"></ul>';box.querySelector(".uib-dw-close").addEventListener("click",()=>{dismissedThisVisit=true;box.hidden=true;});const openRow=row=>{if(row)openNotificationAssignmentDetail(row.dataset.assignmentId);};box.querySelector(".uib-dw-list").addEventListener("click",e=>openRow(e.target.closest("[data-assignment-id]")));box.querySelector(".uib-dw-list").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-assignment-id]")){e.preventDefault();openRow(e.target);}});document.body.appendChild(box);return box;}
  function render(){if(!document.body)return;const box=ensureNotice(),upcoming=dueTodayOrTomorrow(assignments).filter(x=>!isAssignmentHidden(x.id));if(!upcoming.length||dismissedThisVisit){box.hidden=true;return;}const today=dateKey(new Date()),todayCount=upcoming.filter(x=>x.due===today).length,tomorrowCount=upcoming.length-todayCount;const key=signature(upcoming);box.dataset.signature=key;box.querySelector(".uib-dw-title").textContent=todayCount&&tomorrowCount?todayCount+" due today · "+tomorrowCount+" due tomorrow":todayCount?(todayCount===1?"1 assignment is due today":todayCount+" assignments are due today"):(tomorrowCount===1?"1 assignment is due tomorrow":tomorrowCount+" assignments are due tomorrow");box.querySelector(".uib-dw-list").innerHTML=upcoming.slice(0,4).map(x=>'<li class="uib-dw-item" data-assignment-id="'+esc(x.id)+'" tabindex="0" role="button"><strong>'+esc(x.title)+'</strong><small>'+esc(x.course||"")+(x.course?" · ":"")+(x.due===today?"Due today":"Due tomorrow")+" · "+esc(x.time||"23:59")+'</small></li>').join("")+(upcoming.length>4?'<li>+'+(upcoming.length-4)+' more assignment(s)</li>':"");box.hidden=false;}
  function load(){if(requestActive)return;requestActive=true;const callback="uibDeadlineWarning_"+Date.now()+"_"+Math.random().toString(36).slice(2);const script=document.createElement("script");let settled=false;const timeout=setTimeout(finish,12000);function finish(){if(settled)return;settled=true;requestActive=false;clearTimeout(timeout);try{delete window[callback];}catch(e){window[callback]=undefined;}script.remove();}window[callback]=data=>{if(settled)return;assignments=data&&data.ok&&Array.isArray(data.assignments)?data.assignments:[];finish();render();};script.onerror=()=>{finish();};script.src=API+"?action=assignments&callback="+encodeURIComponent(callback)+"&_="+Date.now();document.head.appendChild(script);}
  function start(){ensureNotice();load();setInterval(load,60000);setInterval(render,30000);window.addEventListener("storage",e=>{if(e.key===HIDDEN_ASSIGNMENTS_KEY)render();});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();