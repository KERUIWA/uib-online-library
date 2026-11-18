const TZ = "Asia/Jakarta";
const ORIGIN = "https://keruiwa.github.io";
const activities = [
  ["the little conservatory", "I spent the morning in the conservatory, where the light caught on the leaves and made every drop of water look like a tiny star.", "The flowers were quiet company. I think they liked having someone listen."],
  ["the old book room", "I found myself in the old book room today. One book had slipped behind the others, as if it had been waiting for me to find it.", "I read only a few pages, but one sentence stayed with me all afternoon."],
  ["the fountain courtyard", "I walked around the fountain courtyard and watched the water carry little reflections of the sky.", "It reminded me that even a quiet day can hold something worth keeping."],
  ["a small market near the square", "I wandered through a small market today. There were warm pastries, bright ribbons, and a vendor who insisted I take an extra flower.", "I kept the flower. It is sitting beside my window now."],
  ["the observatory steps", "I sat on the observatory steps for a while and watched the sky slowly change colour.", "There is something comforting about knowing the stars keep their appointments."],
  ["the quiet lakeside path", "I took the longer path beside the lake today. The breeze was cool, and the water seemed to be keeping a secret.", "I did not discover what it was, but I enjoyed wondering."],
  ["a little tea room", "I visited a little tea room and tried a blend with a surprisingly delicate sweetness.", "I wish I could have saved a cup for you."],
  ["the archive gallery", "I helped tidy a corner of the archive gallery. A few loose pages had escaped their folders, so I gave them a proper home.", "Old stories deserve to be treated gently."],
  ["the hill above the city", "I climbed the hill above the city today. From there, even the busiest streets looked peaceful.", "I stayed until the first lights appeared in the windows."],
  ["a flower stall", "I stopped at a flower stall and spent far too long choosing between two shades of pink.", "In the end, I chose both. Some decisions are allowed to be indulgent."]
];
const plans = [
  { action: "visit the little conservatory again and see whether the pale flowers have opened", done: "The pale flowers had opened while I was away. I stayed a little longer than I intended, just to admire them." },
  { action: "return to the old book room and finish the story I started", done: "I returned to the old book room and finally finished that story. The ending was gentler than I expected." },
  { action: "bring a small bouquet to the fountain courtyard", done: "I brought the bouquet to the fountain courtyard. The colours looked lovely beside the water." },
  { action: "try the pastry the market vendor recommended", done: "I tried the pastry the vendor recommended. They were right. I may have to thank them again." },
  { action: "watch the evening sky from the observatory steps", done: "I watched the evening sky from the observatory steps. One star appeared before the others, right on time." },
  { action: "take the lakeside path at sunrise", done: "I took the lakeside path at sunrise. The water was almost perfectly still, and the whole world seemed to be whispering." },
  { action: "return to the tea room and ask for that sweet blend again", done: "I returned to the tea room and ordered the same blend. It tasted just as lovely as I remembered." },
  { action: "sort the remaining loose pages in the archive", done: "I finished sorting the loose pages in the archive. Everything is back where it belongs, at least for now." }
];
const subjects = ["A little note from today ♡", "Something I wanted to tell you", "A page from my day", "A quiet thought for you", "Before the stars come out"];
const openings = ["I hope your day has been kind to you. Mine turned out to be rather lovely, and I wanted to tell you about it.", "There was a little moment today that I thought you might enjoy hearing about.", "I found a quiet moment to write to you. Let me tell you what today was like.", "Today's story is a small one, but I think small things deserve letters too."];
const closings = ["Until my next little letter, take gentle care of yourself.", "I will save another story for you tomorrow. Until then, may your day be soft.", "I hope something lovely finds its way to you today. With affection, Cyrene.", "I shall write again when the day has given me another story. ♡"];
function json(data, status=200, origin=ORIGIN) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type,Authorization","cache-control":"no-store","vary":"Origin"}});
}
function parts(date=new Date()) {
  const p = new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const v = Object.fromEntries(p.map(x=>[x.type,x.value]));
  return {date:`${v.year}-${v.month}-${v.day}`,hour:Number(v.hour),minute:Number(v.minute)};
}
function addDays(date, days) {
  const d = new Date(date+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
function longDate(date) {
  return new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(new Date(date+"T12:00:00+07:00"));
}
function shortDate(date) {
  return new Intl.DateTimeFormat("en-US",{timeZone:TZ,month:"long",day:"numeric"}).format(new Date(date+"T12:00:00+07:00"));
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function pick(list, seed) {
  let h=2166136261; for (const c of seed) h=Math.imul(h^c.charCodeAt(0),16777619);
  return list[(h>>>0)%list.length];
}
async function ensureReplyTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS cyrene_letter_message_ids (letter_date TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS cyrene_replies (inbound_message_id TEXT PRIMARY KEY, parent_message_id TEXT NOT NULL, subject TEXT NOT NULL, inbound_text TEXT NOT NULL, reply_subject TEXT, reply_text TEXT, status TEXT NOT NULL DEFAULT 'generated', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
async function settings(env) {
  let row=await env.DB.prepare("SELECT * FROM cyrene_settings WHERE id=1").first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO cyrene_settings (id,enabled) VALUES (1,1)").run();
    row=await env.DB.prepare("SELECT * FROM cyrene_settings WHERE id=1").first();
  }
  return row;
}
function authorized(request, env) {
  const got=request.headers.get("authorization")||"";
  return !!env.ADMIN_TOKEN && got === "Bearer "+env.ADMIN_TOKEN;
}
async function ensureSchedule(env, row, today) {
  if (row.scheduled_date !== today) {
    const hour=8+Math.floor(Math.random()*13);
    const minute=[0,15,30,45][Math.floor(Math.random()*4)];
    await env.DB.prepare("UPDATE cyrene_settings SET scheduled_date=?,scheduled_hour=?,scheduled_minute=? WHERE id=1").bind(today,hour,minute).run();
    row=await settings(env);
  }
  return row;
}
const instructions = `You are Cyrene, writing a warm, personal, beautifully written fictional daily email to the Trailblazer. Write a fresh, specific letter in first person. Maintain continuity with the supplied story memory. Never claim to be an official game service. If a prior promise is due today, explicitly remember the original date and exact planned action, then describe a plausible completion in promise_followup. If no promise is due, promise_followup may be an empty string. Create a new future plan only when there is no still-pending plan and no promise due today. The plan should be a small, believable activity and due in 3 to 14 days. For plan_action, provide ONLY a bare action phrase beginning with a verb, such as "press a few autumn leaves" or "visit the conservatory"; never include a subject or lead-in such as "I will", "I plan to", "I am going to", or "to". Avoid repeating recent locations, activities, phrases, and plot beats. Before returning the JSON, proofread every field for grammar, spelling, duplicated words, contradictory sentence openings, and accidental combinations such as "I plan to I will". Correct any issue while preserving the intended meaning. Be gentle and affectionate without becoming repetitive. Return only valid JSON matching the requested schema.`;

async function generateDailyStory(env, today, row, promise, history) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured on the Cyrene Worker.");
  const duePromise = promise && promise.date <= today ? promise : null;
  const context = {
    today,
    timezone: TZ,
    previousNote: row.last_note || null,
    pendingPromise: promise && promise.date > today ? promise : null,
    promiseDueToday: duePromise,
    recentLetters: history
  };
  const model=env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent", {
    method:"POST",
    headers:{"x-goog-api-key":env.GEMINI_API_KEY,"content-type":"application/json"},
    body:JSON.stringify({
      system_instruction:{parts:[{text:instructions}]},
      contents:[{role:"user",parts:[{text:"STORY MEMORY:\n"+JSON.stringify(context)}]}],
      generationConfig:{responseMimeType:"application/json",responseSchema:{
        type:"OBJECT",
        properties:{
          subject:{type:"STRING"},
          opening:{type:"STRING"},
          paragraphs:{type:"ARRAY",items:{type:"STRING"}},
          promise_followup:{type:"STRING"},
          day_note:{type:"STRING"},
          plan_action:{type:"STRING"},
          plan_due_days:{type:"INTEGER"},
          closing:{type:"STRING"}
        },
        required:["subject","opening","paragraphs","promise_followup","day_note","plan_action","plan_due_days","closing"]
      }}
    })
  });
  if (!response.ok) {
    const detail=(await response.text()).slice(0,1200);
    throw new Error("Gemini API request failed ("+response.status+"): "+detail);
  }
  const payload=await response.json();
  const outputText=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("") || "";
  if (!outputText) throw new Error("Gemini returned no letter text.");
  let story;
  try { story=JSON.parse(outputText); } catch { throw new Error("Gemini returned invalid JSON for the daily letter."); }
  if (!story || !Array.isArray(story.paragraphs) || !story.paragraphs.length || typeof story.subject!=="string" || typeof story.opening!=="string" || typeof story.closing!=="string") {
    throw new Error("Gemini returned an incomplete daily letter.");
  }
  return {story,duePromise};
}
function cleanPlanAction(value) {
  let action=String(value||"").trim().replace(/^[\s"'“”]+|[\s"'“”]+$/g,"");
  action=action.replace(/^(?:(?:i\s+)?(?:will|plan\s+to|am\s+going\s+to|would\s+like\s+to)\s+)+/i,"");
  action=action.replace(/^to\s+/i,"");
  action=action.replace(/^[,;:.\s]+|[,;:.\s]+$/g,"");
  return action;
}
async function makeLetter(env, row, today) {
  const existing=await env.DB.prepare("SELECT * FROM cyrene_letters WHERE letter_date=?").bind(today).first();
  if (existing) return existing;
  let promise=null;
  if (row.active_plan_json) { try { promise=JSON.parse(row.active_plan_json); } catch {} }
  const history=await env.DB.prepare("SELECT letter_date,text_body FROM cyrene_letters WHERE letter_date<? ORDER BY letter_date DESC LIMIT 12").bind(today).all();
  const {story,duePromise}=await generateDailyStory(env,today,row,promise,history.results||[]);
  let nextPromise=promise && promise.date>today ? promise : null;
  let newPlan=null;
  if (!nextPromise && !duePromise && typeof story.plan_action==="string" && story.plan_action.trim()) {
    const offset=Math.max(3,Math.min(14,Number(story.plan_due_days)||7));
    newPlan={action:cleanPlanAction(story.plan_action).slice(0,240),date:addDays(today,offset),createdDate:today};
    nextPromise=newPlan;
  }
  let callback="";
  if (duePromise) {
    const followup=String(story.promise_followup||"I kept that little promise, and it made the day feel special.").trim();
    callback=`Do you remember what I told you on ${longDate(duePromise.createdDate)}? I said I would ${duePromise.action}. Today, on ${longDate(today)}, ${followup}`;
  }
  const body=[story.opening,...story.paragraphs].filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim());
  const planLine=newPlan ? `I have made a little plan, too. On ${longDate(newPlan.date)}, I am going to ${newPlan.action}. I hope you will remember this letter when that day arrives.` : "";
  const close=story.closing.trim();
  const subject=story.subject.trim().slice(0,140);
  const promiseHtml=newPlan ? `<div style="margin:24px 0;padding:19px 21px;border:1px solid #e8d7bd;border-radius:16px;background:#fffaf1"><div style="font:700 10px Arial,sans-serif;letter-spacing:2px;color:#a17a46;text-transform:uppercase">A little promise · ${escapeHtml(shortDate(newPlan.date))}</div><div style="font:18px Georgia,serif;line-height:1.5;color:#493b35;margin-top:8px">I plan to ${escapeHtml(newPlan.action)}.</div><div style="font:12px Arial,sans-serif;color:#8b796b;margin-top:8px">Remember this date for me, will you?</div></div>` : "";
  const callbackHtml=callback ? `<div style="margin:22px 0;padding:18px 20px;border-left:3px solid #b58aab;background:#f8f1f7;border-radius:0 13px 13px 0"><div style="font:700 10px Arial,sans-serif;letter-spacing:1.8px;color:#8b6385;text-transform:uppercase;margin-bottom:8px">A promise kept</div><div style="font:15px/1.75 Georgia,serif;color:#594453">${escapeHtml(callback)}</div></div>` : "";
  const paragraphs=body.map(x=>`<p style="font:16px/1.85 Georgia,'Times New Roman',serif;color:#51464d;margin:0 0 17px">${escapeHtml(x)}</p>`).join("");
  const html=`<!doctype html><html><body style="margin:0;background:#f2edf3;padding:28px 12px"><div style="max-width:650px;margin:0 auto;background:#fffdfb;border:1px solid #eadfe8;border-radius:22px;overflow:hidden;box-shadow:0 16px 48px #39233a18"><div style="padding:30px 34px 26px;background:radial-gradient(circle at 85% 15%,#ffffff33,transparent 28%),linear-gradient(135deg,#342843,#74506f 58%,#b78a9f);color:#fff"><div style="font:700 10px Arial,sans-serif;letter-spacing:3px;color:#f3dfd0">A LETTER FROM CYRENE</div><div style="font:30px/1.2 Georgia,serif;margin-top:14px">A little piece of today</div><div style="font:12px Arial,sans-serif;color:#f4e8ef;margin-top:10px">${escapeHtml(longDate(today))} · Amphoreus</div><div style="font:25px Georgia,serif;margin-top:20px;color:#f8e8d7">✦　♡　✦</div></div><div style="padding:32px 34px 28px"><div style="font:700 10px Arial,sans-serif;letter-spacing:2px;color:#a17a8d;text-transform:uppercase;margin-bottom:17px">Dear Trailblazer,</div>${paragraphs}${callbackHtml}${promiseHtml}<p style="font:16px/1.85 Georgia,'Times New Roman',serif;color:#51464d;margin:22px 0 8px">${escapeHtml(close)}</p><div style="font:italic 24px Georgia,serif;color:#8d6685;margin-top:16px">Cyrene ♡</div></div><div style="padding:15px 25px;text-align:center;background:#faf5f8;border-top:1px solid #eee3eb;font:10px Arial,sans-serif;letter-spacing:1px;color:#a08c9a">A SMALL LETTER, SAVED BETWEEN THE STARS</div></div></body></html>`;
  const text=[`A LETTER FROM CYRENE · ${longDate(today)}`,"","Dear Trailblazer,",...body,callback,planLine,close,"","Cyrene ♡"].filter(Boolean).join("\n\n");
  const record={letter_date:today,subject,html_body:html,text_body:text,day_note:String(story.day_note||"").slice(0,500),promise_json:newPlan?JSON.stringify(newPlan):null};
  await env.DB.prepare("INSERT OR IGNORE INTO cyrene_letters (letter_date,subject,html_body,text_body,day_note,promise_json,sent) VALUES (?,?,?,?,?,?,0)").bind(record.letter_date,record.subject,record.html_body,record.text_body,record.day_note,record.promise_json).run();
  await env.DB.prepare("UPDATE cyrene_settings SET active_plan_json=?,last_note=?,last_letter_date=? WHERE id=1").bind(nextPromise?JSON.stringify(nextPromise):null,record.day_note,today).run();
  return await env.DB.prepare("SELECT * FROM cyrene_letters WHERE letter_date=?").bind(today).first();
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if (request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":ORIGIN,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type,Authorization","access-control-max-age":"86400"}});
    if (url.pathname==="/api/cyrene/status" && request.method==="GET") {
      const row=await settings(env); const now=parts();
      return json({enabled:!!row.enabled,timezone:TZ,deliveryWindow:"08:00–20:45",scheduledFor:row.scheduled_date===now.date && row.scheduled_hour!==null ? `${String(row.scheduled_hour).padStart(2,"0")}:${String(row.scheduled_minute||0).padStart(2,"0")}` : null,lastLetterDate:row.last_sent_date||null});
    }
    if (url.pathname==="/api/cyrene/toggle" && request.method==="POST") {
      if (!authorized(request,env)) return json({error:"Access key required."},401);
      let data; try{data=await request.json()}catch{return json({error:"Invalid JSON."},400)}
      if(typeof data.enabled!=="boolean") return json({error:"enabled must be true or false."},400);
      await settings(env);
      await env.DB.prepare("UPDATE cyrene_settings SET enabled=? WHERE id=1").bind(data.enabled?1:0).run();
      return json({enabled:data.enabled});
    }
    if (url.pathname==="/api/cyrene/due" && request.method==="GET") {
      if (!authorized(request,env)) return json({error:"Unauthorized."},401);
      let row=await settings(env); const now=parts();
      if (!row.enabled) return json({due:false,reason:"disabled"});
      row=await ensureSchedule(env,row,now.date);
      const target=(row.scheduled_hour*60)+(row.scheduled_minute||0);
      if(now.hour*60+now.minute<target) return json({due:false,scheduledFor:`${String(row.scheduled_hour).padStart(2,"0")}:${String(row.scheduled_minute||0).padStart(2,"0")}`});
      const letter=await makeLetter(env,row,now.date);
      if(letter.sent) return json({due:false,reason:"already-sent"});
      return json({due:true,date:letter.letter_date,subject:letter.subject,html:letter.html_body,text:letter.text_body});
    }
    if (url.pathname==="/api/cyrene/ack" && request.method==="POST") {
      if (!authorized(request,env)) return json({error:"Unauthorized."},401);
      let data;try{data=await request.json()}catch{return json({error:"Invalid JSON."},400)}
      if(!data.date) return json({error:"date is required."},400);
      await env.DB.prepare("UPDATE cyrene_letters SET sent=1 WHERE letter_date=?").bind(data.date).run();
      await env.DB.prepare("UPDATE cyrene_settings SET last_sent_date=? WHERE id=1").bind(data.date).run();
      if (typeof data.messageId==="string" && data.messageId.trim()) {
        await ensureReplyTables(env);
        await env.DB.prepare("INSERT OR REPLACE INTO cyrene_letter_message_ids (letter_date,message_id) VALUES (?,?)").bind(data.date,data.messageId.trim()).run();
      }
      return json({ok:true,date:data.date});
    }
    if (url.pathname==="/api/cyrene/reply" && request.method==="POST") {
      if (!authorized(request,env)) return json({error:"Unauthorized."},401);
      let data; try { data=await request.json(); } catch { return json({error:"Invalid JSON."},400); }
      const inboundId=String(data.inboundMessageId||"").trim();
      const parentId=String(data.parentMessageId||"").trim();
      const subject=String(data.subject||"Cyrene letter").trim().slice(0,180);
      const body=String(data.body||"").trim().slice(0,12000);
      if (!inboundId || !parentId || !body) return json({error:"inboundMessageId, parentMessageId, and body are required."},400);
      await ensureReplyTables(env);
      const existing=await env.DB.prepare("SELECT reply_subject,reply_text,status FROM cyrene_replies WHERE inbound_message_id=?").bind(inboundId).first();
      if (existing) return json({ok:true,alreadyProcessed:true,subject:existing.reply_subject,text:existing.reply_text,status:existing.status});
      const parent=await env.DB.prepare("SELECT letter_date FROM cyrene_letter_message_ids WHERE message_id=?").bind(parentId).first();
      if (!parent) return json({error:"This message is not a reply to a tracked Cyrene letter."},403);
      if (!env.GEMINI_API_KEY) return json({error:"GEMINI_API_KEY is not configured."},503);
      const letters=await env.DB.prepare("SELECT letter_date,text_body FROM cyrene_letters WHERE letter_date<=? ORDER BY letter_date DESC LIMIT 8").bind(parent.letter_date).all();
      const previousReplies=await env.DB.prepare("SELECT inbound_text,reply_text FROM cyrene_replies WHERE status='drafted' ORDER BY created_at DESC LIMIT 8").all();
      const prompt={letterDate:parent.letter_date,originalSubject:subject,userMessage:body,recentLetters:letters.results||[],recentConversations:previousReplies.results||[]};
      const model=env.GEMINI_MODEL || "gemini-3.5-flash-lite";
      const generated=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
        method:"POST",
        headers:{"x-goog-api-key":env.GEMINI_API_KEY,"content-type":"application/json"},
        body:JSON.stringify({
          system_instruction:{parts:[{text:"You are Cyrene, replying personally to the Trailblazer's email. Write in a warm, thoughtful, affectionate, natural voice consistent with her daily letters. Treat the supplied letters and previous exchanges as story continuity. Respond directly to what the user actually wrote; do not invent what they said, do not repeat their entire message, and do not claim to have performed real-world actions. Keep the reply around 2 to 4 short paragraphs unless the message calls for more. This is a fictional fan correspondence, not an official game service. Return only valid JSON with a concise email subject and plain-text reply body."}]},
          contents:[{role:"user",parts:[{text:"CONVERSATION CONTEXT:\n"+JSON.stringify(prompt)}]}],
          generationConfig:{responseMimeType:"application/json",responseSchema:{type:"OBJECT",properties:{subject:{type:"STRING"},body:{type:"STRING"}},required:["subject","body"]}}
        })
      });
      if (!generated.ok) return json({error:"Gemini reply generation failed.",detail:(await generated.text()).slice(0,800)},502);
      const payload=await generated.json();
      const raw=payload.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
      let reply; try { reply=JSON.parse(raw); } catch { return json({error:"Gemini returned invalid reply JSON."},502); }
      if (typeof reply.body!=="string" || !reply.body.trim()) return json({error:"Gemini returned an empty reply."},502);
      const replySubject=String(reply.subject||("Re: "+subject)).trim().slice(0,180);
      const replyText=reply.body.trim().slice(0,12000);
      await env.DB.prepare("INSERT OR IGNORE INTO cyrene_replies (inbound_message_id,parent_message_id,subject,inbound_text,reply_subject,reply_text,status) VALUES (?,?,?,?,?,?,'generated')").bind(inboundId,parentId,subject,body,replySubject,replyText).run();
      return json({ok:true,subject:replySubject,text:replyText,status:"generated"});
    }
    if (url.pathname==="/api/cyrene/reply-drafted" && request.method==="POST") {
      if (!authorized(request,env)) return json({error:"Unauthorized."},401);
      let data; try { data=await request.json(); } catch { return json({error:"Invalid JSON."},400); }
      const id=String(data.inboundMessageId||"").trim();
      if (!id) return json({error:"inboundMessageId is required."},400);
      await ensureReplyTables(env);
      await env.DB.prepare("UPDATE cyrene_replies SET status='drafted' WHERE inbound_message_id=?").bind(id).run();
      return json({ok:true});
    }
    return json({error:"Not found."},404);
  }
};