"use strict";
const $ = id => document.getElementById(id);
const key = "wall-smacker-training";
const format = new Intl.NumberFormat("en-US");
const exact = n => format.format(Math.round(n));
const compact = new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:0});
const short = n => n>=1e15 ? exact(n) : compact.format(n);
const wallHP = 1e10;
const fresh = () => ({
  wall:1,hp:wallHP,points:0,wallPunches:0,manual:0,autoHits:0,manualDamage:0,autoDamage:0,
  bestCombo:0,bestHit:0,cleanBest:0,cleanTotal:0,weakHits:0,cracks:0,
  levels:{},seenUnlocks:[],awards:[],played:0
});
let s = fresh(), tab = "upgrades", filter = "All", viewSignature = "", toastTimer;
let run = newRun();
function newRun() {
  return {combo:0,comboUntil:0,lastManual:-1e6,cleanStreak:0,autoStreak:0,focus:0,
    stamina:15+(s.levels.reserves || 0)*5,chargeAt:0,chargeReady:0,controlled:0,autoControlUsed:false,weakUntil:0,
    spreadUntil:0,strength:0,queuedClean:false,event:null,nextEvent:performance.now()+16000,
    blastUntil:0,impactUntil:0,timers:{},counts:{},autoDamage:{},autoPopupAt:0,paceStart:performance.now()};
}
function decode(raw) {
  const input = JSON.parse(raw);
  if (![1,2,3,4].includes(input?.version) || !input.state || typeof input.state !== "object") throw Error("Unsupported save");
  const data = input.state;
  const state = fresh();
  for (const [name,value] of Object.entries(state)) {
    if (name==="wallPunches" && input.version<4) continue;
    if (typeof value === "number") {
      if (!Number.isFinite(data[name]) || data[name] < 0) throw Error("Invalid save");
      state[name] = Math.min(data[name],1e100);
    }
  }
  state.wall = Math.max(1,Math.min(20,Math.floor(state.wall)));
  if (input.version<4) {
    state.wallPunches = Math.min(25,state.manual);
    if (state.wall>1) {
      const oldMax = input.version===1 ? 1e10 * 2 ** (state.wall-1)
        : Math.round((input.version===2 ? 1e12 : 1e14) * 1.15 ** (state.wall-2));
      state.hp = Math.round(wallHP*Math.min(1,state.hp/oldMax));
    }
  }
  state.hp = Math.min(wallHP,state.hp);
  for (const item of items) {
    const level = data.levels?.[item.id];
    if (Number.isInteger(level) && level > 0) state.levels[item.id] = Math.min(item.max,level);
  }
  if (Array.isArray(data.seenUnlocks)) {
    state.seenUnlocks = items.filter(item=>data.seenUnlocks.includes(item.id)).map(item=>item.id);
  }
  state.awards = achievements.filter(([id])=>Array.isArray(data.awards)&&data.awards.includes(id)).map(([id])=>id);
  return state;
}
function serialize() { return JSON.stringify({version:4,state:s}); }
function save() {
  try { localStorage.setItem(key,serialize()); $("save-status").textContent = "Local autosave"; }
  catch { $("save-status").textContent = "Export to save"; }
}
try { const saved = localStorage.getItem(key); if (saved) { s = decode(saved); run = newRun(); } }
catch { $("save-status").textContent = "Export to save"; }
const level = id => s.levels[id] || 0;
const total = () => wallHP;
const damage = () => total() - s.hp;
const layerIndex = () => {
  const index = materials.findIndex(m=>damage()/total()<m.end);
  return index < 0 ? materials.length-1 : index;
};
const basePower = () => 1+.01*level("harder");
const critChance = () => Math.min(.7,.02*level("align"));
function cost(item) {
  const lv = level(item.id);
  if (item.id==="harder" && !lv) return 0;
  const paid = item.id==="harder" ? lv-1 : lv;
  const growth = item.id==="harder" ? 1.12 : 1.15;
  const milestone = item.routine && lv>=9 ? 1.5 : 1;
  return Math.ceil(item.base*growth**paid*milestone*(item.id==="harder" ? 1 : 1.12**Math.max(0,lv-5)));
}
function requirements(item) {
  if (level(item.id)) return [];
  if (item.id==="harder") return s.wallPunches<25 ? ["25 manual punches"] : [];
  return Object.entries(item.req).filter(([id,min])=>level(id)<min)
    .map(([id,min])=>itemById[id].name+" Lv. "+min);
}
function note(message, toast=false) {
  const li = document.createElement("li");
  li.textContent = message;
  $("log").prepend(li);
  while ($("log").children.length>5) $("log").lastElementChild.remove();
  if (toast) {
    $("toast").textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>$("toast").textContent="",3200);
  }
}
function awardAchievements() {
  for (const [id,name,,check,reward] of achievements) {
    if (s.awards.includes(id) || !check(s)) continue;
    s.awards.push(id);
    wallAudio.play("achievement");
    s.points += reward;
    note("★ "+name+" · +"+reward+" TP",true);
  }
}
const trainingPerBaseHit = () => 1+.02*level("harder");
function buy(item, free=false) {
  const price = cost(item);
  if (requirements(item).length || level(item.id)>=item.max || (!free && s.points<price)) return;
  const locked = items.filter(candidate=>candidate.req[item.id] && requirements(candidate).length);
  s.points -= free ? 0 : price;
  s.levels[item.id] = level(item.id)+1;
  if (item.id==="rhythm" && level(item.id)===1) run.paceStart=performance.now();
  note(item.name+" · Lv. "+level(item.id),level(item.id)===1);
  const lv = level(item.id);
  wallAudio.play(lv===10 ? "levelup" : lv===1 ? item.routine ? "newGen" : "upgrade" : "buy");
  const opened = locked.filter(candidate=>!requirements(candidate).length);
  if (opened.length) note("Unlocked · "+opened.map(candidate=>candidate.name).join(" · "),true);
  save();
}
function rhythm(now) {
  const phase = ((now-run.paceStart)%1450)/1450;
  return 1-Math.abs(phase*2-1);
}
const cleanWidth = () => .105+.018*level("rhythm");
const comboLife = () => 3900 + 240*level("breath")+160*level("keep");
function deal(amount, auto) {
  const applied = Math.min(s.hp,amount);
  s.hp = Math.max(0,s.hp-applied);
  if (auto) s.autoDamage += applied;
  else s.manualDamage += applied;
  return applied;
}
const autoHitColors = {
  drill:"#72f4ff", alternate:"#ffa7d4", heavy:"#ff9a72", repeat:"#a7bfff",
  precision:"#69ffd0", flurry:"#ffc5ff", seam:"#ffc179", pressure:"#a3f9ae",
  impact:"#ff8395", counter:"#87d1ff", relentless:"#c7a2ff", finishDrill:"#ffe18f",
  autoCharge:"#d9f887", autoAll:"#ffb4a2"
};
function autoDamagePopup(amount, source, charged=false, critical=false) {
  const caption = itemById[source].name+(critical ? " · CRIT" : "");
  floatingDamage(amount,charged ? "automatic charged" : "automatic",caption,autoHitColors[source]);
}
function floatingDamage(amount, kind, caption, color) {
  const layer = $("float");
  const number = document.createElement("span");
  number.className = "damage-pop " + kind;
  if (color) number.style.color = color;
  // Leave room for the number and its upward travel inside the wall.
  number.style.setProperty("--impact-x", (21+Math.random()*58)+"%");
  number.style.setProperty("--impact-y", (46+Math.random()*37)+"%");
  number.style.setProperty("--drift", (Math.random()*28-14)+"px");
  number.textContent = "−"+(amount<100 && Math.abs(amount-Math.round(amount))>1e-7 ? previewNumber(amount) : short(amount));
  if (caption) {
    const label = document.createElement("small");
    label.textContent = caption;
    number.append(label);
  }
  if (layer.children.length >= 12) layer.firstElementChild.remove();
  layer.append(number);
  setTimeout(()=>number.remove(),1000);
}
function displayHit(amount, tags, earned) {
  $("last-hit").textContent = "−"+(amount<100 && Math.abs(amount-Math.round(amount))>1e-7 ? previewNumber(amount) : short(amount))+" HP · "+(earned<1 ? "<1" : "+"+exact(Math.floor(earned)))+" TP"+(tags.length ? " · "+tags.join(" · ") : "");
  const critical = tags.includes("Critical");
  const weak = tags.includes("Weak spot");
  const charged = tags.includes("Charged");
  const kind = (critical ? "critical" : weak ? "weak" : "manual")+(charged ? " charged" : "");
  const caption = charged ? (critical ? "CHARGED CRITICAL" : "CHARGED") : critical && weak ? "WEAK SPOT CRIT" : critical ? "CRITICAL"
    : weak ? "WEAK SPOT" : "";
  floatingDamage(amount,kind,caption);
}
function drawFracture() {
  const points = Array.from({length:9},(_,i)=>[5+i*13.75,Math.round(10+Math.random()*28)]);
  const main = points.map(([x,y],i)=>(i ? "L" : "M")+x+" "+y).join(" ");
  const branches = [2,4,6].map(i=>{
    const [x,y]=points[i];
    const edge = y<24 ? 3 : 45;
    const bend = x+(Math.random()<.5 ? -8 : 8);
    return "M"+x+" "+y+" L"+bend+" "+Math.round((y+edge)/2)+" L"+(bend+6)+" "+edge;
  });
  $("fracture-path").setAttribute("d",[main,...branches].join(" "));
}
function burstFracture() {
  wallAudio.play("fractureExplosion");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const debris = $("fracture-debris");
  for (let i=0;i<20;i++) {
    const piece = document.createElement("i");
    piece.style.left = run.event.x+"%";
    piece.style.top = run.event.y+"%";
    const angle = i*2.4;
    piece.style.setProperty("--dx", Math.cos(angle)*(30+i*5)+"px");
    piece.style.setProperty("--dy", Math.sin(angle)*(18+i*2)+"px");
    piece.style.setProperty("--spin", (i*33)+"deg");
    debris.append(piece);
    setTimeout(()=>piece.remove(),700);
  }
}
function shatterWall(now) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  run.blastUntil = now+950;
  const debris = $("wall-debris");
  for (let i=0;i<28;i++) {
    const shard = document.createElement("i");
    const angle = i*2.4;
    const distance = 55+(i*37)%145;
    shard.style.setProperty("--x", (12+(i*29)%77)+"%");
    shard.style.setProperty("--y", (18+(i*17)%65)+"%");
    shard.style.setProperty("--dx", Math.cos(angle)*distance+"px");
    shard.style.setProperty("--dy", (Math.sin(angle)*distance*.65+25)+"px");
    shard.style.setProperty("--spin", (i%2 ? 1 : -1)*(100+i*13)+"deg");
    shard.style.setProperty("--size", (8+(i*7)%24)+"px");
    debris.append(shard);
  }
}
// Per-source base damage before attack multipliers and combat bonuses.
const attackDamage = {
  drill:5, alternate:14.7, heavy:201.6, repeat:218.4, precision:567,
  flurry:273, seam:2268, pressure:1260, impact:13020, counter:5460,
  relentless:7770, finishDrill:5250, autoCharge:210, autoAll:1260
};
function hit(options={}) {
  if (!s.hp) return;
  const {auto=false, manual=false, mult=1, heavy=false, weak=false, clean=false, counter=false, charged=false, source="drill", fracture=false} = options;
  const now = performance.now();
  const currentLayer = layerIndex();
  const earlyLayer = currentLayer ? materials[currentLayer-1].end : 0;
  const cracked = damage()/total() >= earlyLayer+.10*(materials[currentLayer].end-earlyLayer);
  const exposed = weak && run.event?.type==="weak" && run.event.until>now;
  if (run.comboUntil<now) run.combo=0;
  run.combo++;
  run.comboUntil = now+comboLife();
  s.bestCombo = Math.max(s.bestCombo,run.combo);
  if (auto) { s.autoHits++; run.autoStreak++; }
  if (manual) { s.manual++; s.wallPunches++; }
  const hits = s.manual+s.autoHits;
  let bonus = 1;
  const tags = [];
  if (clean) {
    tags.push("Clean");
    if (manual) {
      s.cleanTotal++;
      run.cleanStreak++;
      s.cleanBest = Math.max(s.cleanBest,run.cleanStreak);
      if (run.cleanStreak%5===0) {
        run.weakUntil = Math.max(run.weakUntil,now+9000);
        note("Perfect Rhythm · +15% critical chance for 9 seconds",true);
      }
    }
    if (level("focus")) run.focus=Math.min(100,run.focus+4+level("focus")*2);
    bonus += .12*level("hip")+(manual ? .1*level("double") : 0);
    if (run.focus>=50) bonus += .12*level("flow");
  } else if (manual) run.cleanStreak=0;
  if (manual && now-run.lastManual>2000) bonus += .15*level("plant");
  if (manual) run.lastManual=now;
  if (hits%10===0) bonus += .35*level("body");
  if (hits%5===0) bonus += .10*level("jabs");
  if (run.combo%2===0) bonus += .15*level("pair");
  if (run.combo%10===0) bonus += .25*level("chain");
  bonus += Math.min(1,run.combo/30)*.15*level("follow");
  if (cracked) bonus += .10*level("surface");
  if (run.combo>=10) bonus += .08*level("same");
  if (auto) bonus += Math.min(1,run.autoStreak/80)*.1*level("marathon");
  if (currentLayer>0) bonus += .12*level("drive");
  if (run.spreadUntil>now) bonus += .18*level("spread");
  if (run.buckleUntil>now) bonus += .18*level("buckle");
  if (heavy) { bonus += run.strength; run.strength=0; }
  if (charged) {
    bonus += .50*level("force");
    if (level("buckle")) run.buckleUntil=now+5500;
  }
  bonus += run.controlled;
  run.controlled=0;
  if (exposed) {
    bonus += 2+.25*level("aim")+.10*level("pin");
    s.weakHits++;
    run.event=null;
    tags.push("Weak spot");
  }
  const critical = (exposed && clean && level("pin")) ||
    Math.random()<critChance()+(run.weakUntil>now ? .15 : 0);
  const material = currentLayer===1 ? (run.combo>=12 ? 1.2 : .82)
    : currentLayer===2 ? (heavy ? 1.65 : .72)
    : currentLayer===3 ? (exposed || critical ? 1.5 : .78) : 1;
  if (critical) tags.push("Critical");
  if (charged) tags.push("Charged");
  const critMult = critical ? 2+(exposed ? .25*level("perfect") : 0) : 1;
  const attackBase = auto || charged || source!=="drill" ? attackDamage[source] : 1;
  const modifiers = mult*bonus*material*critMult;
  const amount = attackBase*basePower()*modifiers;
  s.bestHit = Math.max(s.bestHit,amount);
  let applied = deal(amount,auto);
  if (fracture && run.event?.type==="crack" && run.event.until>now) {
    const wasBelowGoal=run.event.progress<run.event.goal;
    run.event.progress += heavy ? 3+level("stress") : 1;
    run.event.flashUntil = now+120;
    if (wasBelowGoal && run.event.progress>=run.event.goal) {
      const extra = deal(amount*3+12*basePower(),auto);
      applied += extra;
      s.cracks++;
      wallAudio.play("glitchClaim");
      note("Crack burst · −"+short(extra)+" HP",true);
    }
  }
  if (s.hp && layerIndex()>currentLayer) {
    run.spreadUntil = now+20000;
    if (level("support")) applied += deal(amount*.25*level("support"),auto);
    if (s.hp) {
      wallAudio.play("coreStage");
      note("Layer breached · "+materials[layerIndex()].name,true);
    }
  }
  const damageRatio = modifiers;
  const trainingRatio = Math.min(damageRatio,2)+Math.log2(1+Math.max(0,damageRatio-2));
  const earned = Math.max(.01,Math.round(100*trainingRatio**.85*trainingPerBaseHit()*(auto ? .65 : 1))/100);
  s.points = Math.round((s.points+earned)*100)/100;
  if (auto && charged) autoDamagePopup(applied,source,true,critical);
  else if (auto) run.autoDamage[source] = (run.autoDamage[source] || 0)+applied;
  else {
    displayHit(applied,tags,earned);
    wallAudio.play(exposed ? "glitchClaim" : critical ? "crit" : "click");
  }
  if (manual && s.wallPunches===25 && !level("harder")) buy(itemById.harder,true);
  awardAchievements();
  if (!s.hp) { shatterWall(now); wallAudio.play("ending"); note("Wall "+s.wall+" destroyed!",true); save(); }
  if (s.hp && heavy && critical && !counter && level("counter")) {
    hit({auto:true,source:"counter",counter:true,mult:(1.5+.35*level("counter"))*(level("counter")>=10 ? 2 : 1)});
  }
}
function punch(weak=false, fracture=false) {
  const now=performance.now();
  const clean=Boolean(level("rhythm")) && Math.abs(rhythm(now)-.5)<=cleanWidth();
  hit({manual:true,clean,weak,fracture});
  render(now);
}
function speed(id) {
  return 1+.10*level("quick")+(run.combo>=30 ? .09*level("wind") : 0)+
    (id==="relentless" ? Math.min(1,run.autoStreak/100)*.14*level(id) : 0);
}
const interval = item => item.interval / ((1+.09*(level(item.id)-1))*speed(item.id)*(level(item.id)>=10 ? 2 : 1));
const staminaCap = () => 20+level("stamina")*6+level("reserves")*10;
function routineTick(item) {
  const {id,mult} = item;
  const lv = level(id);
  const count = run.counts[id] = (run.counts[id] || 0)+1;
  if (id==="strength") { run.strength=Math.min(3,run.strength+.14*lv); return; }
  if (id==="timing") { run.queuedClean=true; return; }
  if (id==="breathing") { if (run.combo) run.comboUntil=performance.now()+comboLife(); return; }
  if (id==="footwork") { run.nextEvent-=400*lv; return; }
  if (id==="conditioning") { run.stamina=Math.min(staminaCap(),run.stamina+2*lv); return; }
  if (id==="focusDrill") { run.focus=Math.min(100,run.focus+3*lv); return; }
  let strikes = id==="alternate" ? 2 : 1;
  let multiplier = mult*(1+.16*(lv-1));
  if (id==="flurry") {
    const energy = Math.max(4,12-level("shoulders")*.7);
    if (run.stamina<energy) return;
    run.stamina-=energy;
    strikes=4;
    multiplier *= 1+.2*level("burst");
  }
  if (id==="finishDrill") {
    useFinisher(true);
    return;
  }
  if (id==="repeat" && run.combo>=10) multiplier*=1.7;
  if (id==="pressure" && count%2===0) multiplier*=2;
  if (id==="impact" && layerIndex()>=1) multiplier*=1.5;
  for (let i=0;i<strikes;i++) {
    const clean = run.queuedClean || id==="precision" || (id==="drill" && lv>=5 && count%5===0);
    run.queuedClean=false;
    hit({auto:true,source:id,mult:multiplier,clean,heavy:multiplier>=3,
      weak:id==="precision" && lv>=5 && run.event?.type==="weak"});
  }
}
let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(1,(now-lastTick)/1000);
  lastTick = now;
  if (s.hp) {
    s.played += dt;
    if (run.comboUntil<now) run.combo=0;
    run.stamina = Math.min(staminaCap(),run.stamina+dt*(.8+.32*level("pacing")));
    run.focus = Math.max(0,run.focus-dt*1.15/(1+.3*level("composure")));
    if (run.event?.until<=now) {
      if (run.event.type==="crack") burstFracture();
      else wallAudio.play("glitchMiss");
      run.event=null;
    }
    if (damage()>=100 && !run.event && now>=run.nextEvent) {
      const type = Math.random()<.6 ? "weak" : "crack";
      const duration = type==="weak" ? 5000+450*level("read") : 9000;
      run.event={type,until:now+duration,duration,progress:0,goal:12};
      if (type==="crack") {
        drawFracture();
        run.event.x = 24+Math.random()*52;
        run.event.y = 23+Math.random()*43;
        $("fracture").style.left = run.event.x+"%";
        $("fracture").style.top = run.event.y+"%";
      }
      if (type==="weak") {
        const target = $("weak-spot");
        target.dataset.shape = ["circle","diamond","hexagon"][Math.floor(Math.random()*3)];
        target.style.left = (Math.random()<.5 ? 12+Math.random()*15 : 73+Math.random()*15)+"%";
        target.style.top = (24+Math.random()*52)+"%";
      }
      run.nextEvent=now+23000+Math.random()*8000;
      wallAudio.play("glitchSpawn");
      note(type==="weak" ? "◆ Weak spot exposed" : "◆ A crack is spreading",true);
    }
    if (level("autoTarget") && run.event?.type==="weak" && !run.event.autoExtended &&
        run.event.until-now<=1000 && useTargetLock(now)) run.event.autoExtended=true;
    if (level("autoAll") && run.focus>=99) useAllIn(true);
    if (level("autoControl") && (!level("autoAll") || !level("all") || !run.autoControlUsed) &&
        useControlledPower()) run.autoControlUsed=true;
    if (level("autoCharge")) useCharge(now,true);
    for (const item of routines) {
      if (!s.hp || !level(item.id) || !item.interval) continue;
      run.timers[item.id]=(run.timers[item.id] || 0)+dt;
      const period=interval(item);
      const wait = item.id==="precision" && level(item.id)>=5 && run.event?.type!=="weak" ? 5 : 0;
      if (run.timers[item.id]>=period+wait) {
        run.timers[item.id]=0;
        routineTick(item);
      }
    }
  }
  if (now>=run.autoPopupAt || !s.hp) {
    const batches = Object.entries(run.autoDamage);
    for (const [source,amount] of batches) autoDamagePopup(amount,source);
    if (batches.length) wallAudio.play("autoclick");
    run.autoDamage={};
    run.autoPopupAt=now+350;
  }
  render(now);
}

// Describes each skill's real gameplay effect at the current and next level.
// Conditional effects are labelled so previews never imply an unconditional bonus.
const previewNumber = n => Number(n.toFixed(2)).toLocaleString("en-US",{maximumFractionDigits:2});
const previewPercent = n => previewNumber(n)+"%";
const previewSeconds = ms => previewNumber(ms/1000)+"s";
function skillEffect(id,lv) {
  switch (id) {
    case "harder": return {name:"Base punch damage",value:previewNumber(1+.01*lv)+" HP",extra:"Base TP/hit: "+previewNumber(1+.02*lv)};
    case "plant": return {name:"First hit after pause",value:"+"+previewPercent(15*lv)+" damage"};
    case "hip": return {name:"Clean-hit bonus",value:"+"+previewPercent(12*lv)+" damage"};
    case "drive": return {name:"Later-layer bonus",value:"+"+previewPercent(12*lv)+" damage"};
    case "body": return {name:"Every 10th hit",value:"+"+previewPercent(35*lv)+" damage"};
    case "force": return {name:"Charged punch bonus",value:"+"+previewPercent(50*lv)+" damage"};
    case "quick": return {name:"Routine speed bonus",value:"+"+previewPercent(10*lv)};
    case "windup": return {name:"Charge time",value:lv ? previewSeconds(1800/(1+.22*lv)) : "Not unlocked"};
    case "recovery": return {name:"Charge cooldown",value:previewSeconds(2400/(1+.21*lv))};
    case "jabs": return {name:"Every 5th hit",value:"+"+previewPercent(10*lv)+" damage"};
    case "burst": return {name:"Flurry damage bonus",value:"+"+previewPercent(20*lv)};
    case "wind": return {name:"Speed at combo 30+",value:"+"+previewPercent(9*lv)};
    case "rhythm": return {name:"Clean timing window",value:lv ? previewPercent((.105+.018*lv)*200)+" of bar" : "Not unlocked"};
    case "align": return {name:"Critical chance",value:previewPercent(Math.min(70,2*lv))};
    case "aim": return {name:"Weak-spot bonus",value:"+"+previewPercent(25*lv)+" damage"};
    case "read": return {name:"Weak-spot duration",value:previewSeconds(5000+450*lv)};
    case "pin": return {name:"Clean weak-spot hit",value:lv ? "Guaranteed crit; +"+previewPercent(10*lv)+" damage" : "No guaranteed crit"};
    case "perfect": return {name:"Weak-spot crit multiplier",value:previewNumber(2+.25*lv)+"×"};
    case "stamina": return {name:"Flurry energy capacity",value:previewNumber(20+6*lv+10*level("reserves"))};
    case "pacing": return {name:"Flurry energy regen",value:previewNumber(.8+.32*lv)+"/sec"};
    case "breath": return {name:"Combo duration",value:previewSeconds(3900+240*lv+160*level("keep"))};
    case "shoulders": return {name:"Energy per flurry",value:previewNumber(Math.max(4,12-.7*lv))};
    case "reserves": return {name:"Flurry energy capacity",value:previewNumber(20+6*level("stamina")+10*lv),extra:"Starting energy bonus: +"+previewNumber(5*lv)};
    case "marathon": return {name:"Max auto-streak damage bonus",value:"+"+previewPercent(10*lv)};
    case "pair": return {name:"Even combo hit",value:"+"+previewPercent(15*lv)+" damage"};
    case "follow": return {name:"Max combo damage bonus",value:"+"+previewPercent(15*lv)};
    case "double": return {name:"Clean manual hit",value:"+"+previewPercent(10*lv)+" damage"};
    case "keep": return {name:"Combo duration",value:previewSeconds(3900+240*level("breath")+160*lv)};
    case "chain": return {name:"Every 10th combo hit",value:"+"+previewPercent(25*lv)+" damage"};
    case "finish": return {name:"Finisher at combo 15",value:lv ? previewNumber(3+15*(.05+.01*lv))+"×" : "Not unlocked"};
    case "surface": return {name:"Damaged-layer bonus",value:"+"+previewPercent(10*lv)};
    case "same": return {name:"At combo 10+",value:"+"+previewPercent(8*lv)+" damage"};
    case "stress": return {name:"Crack progress per heavy hit",value:previewNumber(3+lv)};
    case "spread": return {name:"Later-layer temporary bonus",value:"+"+previewPercent(lv ? 18*lv : 0)};
    case "buckle": return {name:"Charged-hit weakening",value:lv ? "+18% for 5.5s (refreshes)" : "Not unlocked"};
    case "support": return {name:"Extra breach damage",value:"+"+previewPercent(25*lv)};
    case "focus": return {name:"Focus per clean hit",value:lv ? previewNumber(4+2*lv) : "Not unlocked"};
    case "composure": return {name:"Focus decay",value:previewNumber(1.15/(1+.3*lv))+"/sec"};
    case "control": return {name:"Controlled Power bonus",value:lv ? "+"+previewPercent(25*lv)+" damage" : "Not unlocked"};
    case "target": return {name:"Target Lock extension",value:lv ? previewSeconds(2500+500*lv) : "Not unlocked"};
    case "flow": return {name:"Clean hit at 50+ Focus",value:lv ? "+12% damage (fixed)" : "Not unlocked"};
    case "all": return {name:"All In at 100 Focus",value:lv ? previewNumber(2+100*(.045+.006*lv))+"×" : "Not unlocked"};
    default: return {name:"Skill effect",value:lv ? "Enabled" : "Not unlocked"};
  }
}
function generatorEffect(item,lv) {
  if (!lv) return {name:"Generator",value:"Not activated"};
  if (!item.interval) return {name:"Automation",value:"Enabled"};
  const speedBonus = 1+.1*level("quick")+(run.combo>=30 ? .09*level("wind") : 0)+
    (item.id==="relentless" ? Math.min(1,run.autoStreak/100)*.14*lv : 0);
  const period = item.interval/((1+.09*(lv-1))*speedBonus*(lv>=10 ? 2 : 1));
  const perHit = item.mult ? (attackDamage[item.id] || 0)*(item.mult*(1+.16*(lv-1)))*(1+.01*level("harder")) : 0;
  const effect = {name:"Action interval",value:previewSeconds(period)};
  if (perHit) effect.extra="Base action damage: "+previewNumber(perHit)+(item.id==="flurry" ? " per strike (4 strikes)" : item.id==="alternate" ? " per strike (2 strikes)" : " per strike");
  else if (item.id==="strength") effect.extra="Heavy-hit strength gain: +"+previewNumber(.14*lv)+" per action (max +3)";
  else if (item.id==="footwork") effect.extra="Event timer reduction: "+previewSeconds(400*lv)+" per action";
  else if (item.id==="conditioning") effect.extra="Flurry energy restored: "+previewNumber(2*lv)+" per action";
  else if (item.id==="focusDrill") effect.extra="Focus generated: "+previewNumber(3*lv)+" per action";
  return effect;
}
function effectPreview(item,lv) {
  const current = item.routine ? generatorEffect(item,lv) : skillEffect(item.id,lv);
  const next = lv<item.max ? (item.routine ? generatorEffect(item,lv+1) : skillEffect(item.id,lv+1)) : null;
  const escape = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  return '<div class="effect-preview" aria-label="'+escape(current.name)+' preview">'+
    '<span class="effect-name">'+escape(current.name)+'</span><div class="effect-values">'+
    '<span><em>Current</em><strong>'+escape(current.value)+'</strong></span>'+
    '<span><em>'+(next ? 'Next level' : 'Maximum')+'</em><strong class="'+(next ? 'effect-next' : '')+'">'+escape(next ? next.value : 'Maxed')+'</strong></span></div>'+
    (current.extra || next?.extra ? '<div class="effect-extra">'+escape(current.extra || '—')+
      (next ? ' → '+escape(next.extra || '—') : '')+'</div>' : '')+'</div>';
}
function row(title,description,detail,actions="",locked=false,icon="",preview="") {
  return '<article class="row'+(locked ? ' locked' : '')+(icon ? ' has-icon' : '')+'">'+
    (icon ? '<span class="item-icon" aria-hidden="true"><span>'+icon+'</span></span>' : '')+
    '<div><h3>'+title+
    '</h3><p>'+description+'</p>'+(detail ? '<small>'+detail+'</small>' : '')+preview+
    '</div><div class="row-actions">'+actions+'</div></article>';
}
const upgradeGroups = branches.map(([name])=>[name,upgrades.filter(item=>item.branch===name)]);
function purchaseStatus(list) {
  const available = list.filter(item=>!requirements(item).length && level(item.id)<item.max);
  return {
    unseen:available.filter(item=>!level(item.id) && !s.seenUnlocks.includes(item.id)),
    affordable:available.filter(item=>s.points>=cost(item)).length
  };
}
function branchBadges(list) {
  const {unseen,affordable} = purchaseStatus(list);
  return (unseen.length ? '<span class="tab-badge tab-new" aria-label="New unlocks">New</span>' : '')+
    (affordable ? '<span class="tab-badge tab-affordable" aria-label="'+affordable+
      ' affordable purchases">'+affordable+'</span>' : '');
}
function acknowledgeUnlocks(list) {
  const {unseen} = purchaseStatus(list);
  if (unseen.length) {
    s.seenUnlocks.push(...unseen.map(item=>item.id));
    save();
  }
}
function renderTabBadges() {
  for (const [name,list] of [["upgrades",upgrades],["routines",routines]]) {
    const {unseen,affordable} = purchaseStatus(list);
    const newBadge = $(name+"-new");
    const countBadge = $(name+"-affordable");
    newBadge.hidden = !unseen.length;
    newBadge.title = unseen.map(item=>item.name).join(", ");
    newBadge.setAttribute("aria-label",unseen.length+" new unlocks");
    countBadge.hidden = !affordable;
    countBadge.textContent = affordable;
    countBadge.title = affordable+" affordable purchases";
    countBadge.setAttribute("aria-label",countBadge.title);
  }
}
function renderCatalog() {
  const list = items.filter(item=>Boolean(item.routine)===(tab==="routines"));
  const unlockedGroups = upgradeGroups.filter(([name,group])=>
    name==="Power" || group.some(item=>!requirements(item).length));
  if (tab==="upgrades" && !unlockedGroups.some(([name])=>name===filter)) filter="All";
  const groups = unlockedGroups.filter(([name])=>filter==="All" || name===filter);
  const focusedFilter = document.activeElement?.dataset.filter;
  const state = list.map(item=>[level(item.id),requirements(item),s.points>=cost(item)]);
  const signature = JSON.stringify([tab,filter,state,s.seenUnlocks,s.awards,s.wall,tab==="records" && [
    s.manual,s.autoHits,s.bestHit,s.bestCombo,s.manualDamage,s.autoDamage
  ]]);
  if (signature===viewSignature) return;
  const previous = document.activeElement;
  const focusKey = previous?.closest("#catalog") ? previous.dataset.buy : "";
  viewSignature=signature;
  document.querySelectorAll("[data-tab]").forEach(button=>button.setAttribute("aria-pressed",button.dataset.tab===tab));
  $("filters").innerHTML=tab==="upgrades" && unlockedGroups.length>1 ? [["All",[]],...unlockedGroups].map(([name,group])=>
    '<button data-filter="'+name+'" aria-pressed="'+(filter===name)+'">'+
    (name==="All" ? "By Branch" : name)+branchBadges(group)+'</button>').join("") : "";
  if (focusedFilter) [...$("filters").children].find(child=>child.dataset.filter===focusedFilter)?.focus({preventScroll:true});
  if (tab==="records") {
    $("catalog").innerHTML=row("Punch records",exact(s.manual)+" manual · "+exact(s.autoHits)+" automatic",
      "Hardest hit "+short(s.bestHit)+" · Best combo "+exact(s.bestCombo))+
      row("Damage dealt",short(s.manualDamage)+" manual · "+short(s.autoDamage)+" automatic","")+
      achievements.map(([id,name,description,,reward])=>row((s.awards.includes(id) ? "★ " : "☆ ")+name,
        description,(s.awards.includes(id) ? "Earned · " : "")+"+"+reward+" TP","",!s.awards.includes(id))).join("");
    return;
  }
  function renderItems(group) {
    const available = group.filter(item=>!requirements(item).length);
    const nextLocked = group.find(item=>requirements(item).length);
    return [...available,...(nextLocked ? [nextLocked] : [])].map(item=>{
      const unmet=requirements(item);
      const lv=level(item.id);
      const price=cost(item);
      const max=lv>=item.max;
      const next = items.find(candidate=>!level(candidate.id) && candidate.req[item.id]>lv);
      const milestone = item.routine && item.max>=10 && lv<10 ? (item.interval ? " · Lv. 10 doubles frequency" : " · Lv. 10 doubles follow-up power")
        : next ? " · Lv. "+next.req[item.id]+" toward "+next.name : "";
      const detail = unmet.length ? "Unlock · "+unmet.join(" · ") : lv ? "Lv. "+lv+" / "+item.max+milestone : "Available";
      const label = max ? "Maxed" : price ? exact(price)+" TP" : "Free";
      const buttons = unmet.length ? "" :
        '<button data-buy="'+item.id+'" aria-label="Upgrade '+item.name+' for '+label+'"'+
        (max || s.points<price ? " disabled" : "")+'>'+label+'</button>';
      const prerequisites = !lv && !unmet.length ? Object.entries(item.req)
        .map(([id,min])=>itemById[id].name+" Lv. "+min) : [];
      const description = item.description+(prerequisites.length ? " Requires "+prerequisites.join(" · ")+ "." : "");
      return row(item.name,description,detail,buttons,unmet.length,itemIcons[item.id],item.routine ? "" : effectPreview(item,lv));
    }).join("");
  }
  $("catalog").innerHTML=tab==="routines" ? renderItems(routines) : groups.map(([name,group])=>
    '<section class="upgrade-branch" aria-label="'+name+'"><h3 class="branch-heading">'+
    name+branchBadges(group)+'</h3>'+renderItems(group)+'</section>').join("");
  if (focusKey) $("catalog").querySelector("[data-buy"+'="'+focusKey+'"]')?.focus({preventScroll:true});
}
function render(now=performance.now()) {
  const index = s.hp ? layerIndex() : materials.length-1;
  const mat = materials[index];
  const pct = 100*s.hp/total();
  $("wall-number").textContent="Wall "+s.wall;
  $("layer-number").textContent="Layer "+(index+1)+" / "+materials.length;
  $("material").textContent=mat.name;
  $("material").title=mat.tip;
  $("percent").textContent=pct===100 ? "100%" : pct===0 ? "0%" : pct>99 ? ">99%" : pct<1 ? "<1%" : Math.floor(pct)+"%";
  $("wall-progress").firstElementChild.style.width=pct+"%";
  $("wall-progress").setAttribute("aria-valuenow",pct);
  $("hp").textContent=exact(s.hp)+" HP";
  $("max-hp").textContent="/ "+exact(total());
  $("points").textContent=exact(Math.floor(s.points));
  $("points").title="Training Points earned from manual and automatic hits";
  $("power").textContent=previewNumber(basePower());
  const rate = routines.reduce((sum,item)=>sum+(item.interval && item.mult && level(item.id)
    ? (item.id==="alternate" ? 2 : item.id==="flurry" ? 4 : 1)/interval(item) : 0),0)+(level("autoCharge") && level("windup") ? 1000/(chargeTime()+chargeCooldown()) : 0);
  $("auto-rate").textContent=rate>0 && rate<1 ? "<1" : exact(rate);
  $("auto-rate").title="Potential rate with all purchased routines firing";
  $("crit").textContent=Math.round(100*(critChance()+(run.weakUntil>now ? .15 : 0)))+"%";
  $("combo").textContent=exact(run.combo);
  $("punch").disabled=!s.hp;
  $("timing-panel").hidden=!level("rhythm") || !s.hp;
  document.querySelector(".timing b").style.left=rhythm(now)*100+"%";
  document.querySelector(".timing i").style.left=(.5-cleanWidth())*100+"%";
  document.querySelector(".timing i").style.width=cleanWidth()*200+"%";
  $("timing-tip").textContent="Hit in the bright zone";
  $("focus-panel").hidden=!level("focus") || !s.hp;
  $("focus-value").textContent=Math.floor(run.focus)+" / 100";
  $("focus-bar").firstElementChild.style.width=run.focus+"%";
  $("charge").hidden=!level("windup");
  $("charge").disabled=now<run.chargeReady || (run.chargeAt>now);
  $("charge").textContent=run.chargeAt ? now>=run.chargeAt ? "Release charged punch" : "Charging…" : "Charge punch";
  $("finisher").hidden=!level("finish");
  $("finisher").disabled=run.combo<15;
  $("focus-power").hidden=!level("control");
  $("focus-power").disabled=run.focus<20 || !!run.controlled;
  $("target-lock").hidden=!level("target");
  $("target-lock").disabled=run.focus<25 || run.event?.type!=="weak";
  $("all-in").hidden=!level("all");
  $("all-in").disabled=run.focus<30;
  $("combat-actions").hidden=!s.hp || [...$("combat-actions").children].every(button=>button.hidden);
  const event=run.event;
  const weak = s.hp>0 && event?.type==="weak" && event.until>now;
  if (!weak && document.activeElement===$("weak-spot") && s.hp) {
    $("punch").focus({preventScroll:true});
  }
  $("weak-spot").hidden=!weak;
  if (weak) {
    const remaining=event.until-now;
    $("weak-time").textContent=Math.ceil(remaining/1000)+"s";
    $("weak-fill").style.transform="scaleX("+Math.min(1,remaining/event.duration)+")";
  }
  const crack = s.hp>0 && event?.type==="crack" && event.until>now;
  if (!crack && document.activeElement===$("fracture") && s.hp) $("punch").focus({preventScroll:true});
  $("fracture").hidden=!crack;
  $("fracture").classList.toggle("fracture-hit",crack && now<event.flashUntil);
  $("event-panel").hidden=!crack;
  if (crack) {
    const seconds=Math.ceil((event.until-now)/1000);
    const progress=Math.min(event.progress,event.goal);
    const growth=1-Math.exp(-event.progress/32);
    $("fracture").style.setProperty("--fracture-width",3+growth*9);
    $("fracture").style.setProperty("--fracture-scale",1+growth*.55);
    $("fracture-time").textContent=seconds+"s";
    $("event-title").textContent="◆ Crack spreading";
    $("event-description").textContent=progress+" / "+event.goal+" · "+seconds+"s left · Click the fracture to widen it.";
  }
  const blasting = !s.hp && now<run.blastUntil;
  $("strike-zone").classList.toggle("shattering",blasting);
  $("strike-zone").classList.toggle("charged-impact",!blasting && s.hp>0 && now<run.impactUntil);
  $("strike-zone").hidden=!s.hp && !blasting;
  if (!blasting && $("wall-debris").firstChild) $("wall-debris").replaceChildren();
  $("victory").hidden=!!s.hp || blasting;
  if (!s.hp) {
    $("victory-summary").textContent=short(s.manualDamage)+" lifetime manual damage · "+
      short(s.autoDamage)+" lifetime automatic damage · "+Math.floor(s.played/60)+" min active play";
    $("next-wall").hidden=s.wall>=20;
  }
  $("objective").textContent=!s.hp ? s.wall>=20 ? "All walls cleared." : "Starting the next wall resets TP, skills, and generators. Lifetime stats and achievements carry over."
    : !level("harder") ? "Throw "+Math.max(0,25-s.wallPunches)+" more punches to unlock Punch Harder."
    : level("harder")<5 ? "Raise Punch Harder to Lv. 5 to open Plant Your Feet and Punching Drill."
    : !level("drill") ? "Buy Punching Drill in Generators to start automatic punches."
    : mat.tip;
  renderTabBadges();
  renderCatalog();
}
$("punch").onclick=()=>punch();
$("fracture").onclick=()=>{
  if (s.hp && run.event?.type==="crack" && run.event.until>performance.now()) punch(false,true);
};
$("weak-spot").onclick=()=>{
  if (!s.hp || run.event?.type!=="weak" || run.event.until<=performance.now()) return;
  punch(true);
  $("punch").focus({preventScroll:true});
};
document.addEventListener("keydown",event=>{
  if (event.code!=="Space" || event.altKey || event.ctrlKey || event.metaKey || $("save-dialog").open ||
    event.target.closest("button,input,textarea,select")) return;
  event.preventDefault();
  if (!event.repeat) punch();
});
const chargeTime = () => 1800/(1+.22*level("windup"));
const chargeCooldown = () => 2400/(1+.21*level("recovery"));
function useCharge(now, auto) {
  if (!s.hp || !level("windup") || now<run.chargeReady) return;
  if (!run.chargeAt) {
    run.chargeAt=now+chargeTime();
    return;
  }
  if (now<run.chargeAt) return;
  run.chargeAt=0;
  run.impactUntil=now+340;
  run.chargeReady=now+chargeCooldown();
  hit({auto,source:"autoCharge",manual:!auto,heavy:true,charged:true,mult:4});
  if (auto) wallAudio.play("autoclick");
}
$("charge").onclick=()=>{
  useCharge(performance.now(),false);
  render();
};
function useFinisher(auto) {
  if (!s.hp || !level("finish") || run.combo<(auto ? 25 : 15)) return;
  const mult=3+run.combo*(.05+.01*level("finish"));
  run.combo=0;
  hit({auto,source:"finishDrill",manual:!auto,heavy:true,mult});
}
function useControlledPower() {
  if (!s.hp || !level("control") || run.focus<20 || run.controlled) return;
  run.focus-=20;
  run.controlled=1+.25*level("control");
  return true;
}
function useTargetLock(now) {
  if (!s.hp || !level("target") || run.focus<25 || run.event?.type!=="weak" || run.event.until<=now) return false;
  const extension=2500+500*level("target");
  run.focus-=25;
  run.event.until+=extension;
  run.event.duration+=extension;
  return true;
}
function useAllIn(auto) {
  if (!s.hp || !level("all") || run.focus<30) return;
  const mult=2+run.focus*(.045+.006*level("all"));
  run.focus=0;
  run.autoControlUsed=false;
  hit({auto,source:"autoAll",manual:!auto,heavy:true,mult});
}
$("finisher").onclick=()=>{useFinisher(false);render();};
$("focus-power").onclick=()=>{useControlledPower();render();};
$("target-lock").onclick=()=>{useTargetLock(performance.now());render();};
$("all-in").onclick=()=>{useAllIn(false);render();};
$("next-wall").onclick=()=>{
  if (s.hp || s.wall>=20 || performance.now()<run.blastUntil) return;
  s.wall++;
  s.hp=total();
  s.points=0;
  s.wallPunches=0;
  s.levels={};
  s.seenUnlocks=[];
  tab="upgrades";
  filter="All";
  $("catalog").scrollTop=0;
  run=newRun();
  $("float").replaceChildren();
  $("wall-debris").replaceChildren();
  $("fracture-debris").replaceChildren();
  $("last-hit").textContent="Click or press Space";
  note("Wall "+s.wall+" · "+short(total())+" HP",true);
  save();
  render();
};
document.querySelector(".tabs").onclick=event=>{
  const button=event.target.closest("[data-tab]");
  if (!button) return;
  wallAudio.play("tab");
  tab=button.dataset.tab;
  if (tab==="routines") acknowledgeUnlocks(routines);
  filter="All";
  $("catalog").scrollTop=0;
  render();
};
$("filters").onclick=event=>{
  const button=event.target.closest("[data-filter]");
  if (!button) return;
  wallAudio.play("select");
  filter=button.dataset.filter;
  const group = upgradeGroups.find(([name])=>name===filter);
  if (group) acknowledgeUnlocks(group[1]);
  $("catalog").scrollTop=0;
  render();
  [...$("filters").children].find(child=>child.dataset.filter===filter)?.focus();
};
$("catalog").onclick=event=>{
  const button=event.target.closest("button");
  if (!button) return;
  if (button.dataset.buy) buy(itemById[button.dataset.buy]);
  render();
};
function renderSoundSettings() {
  $("sound-toggle").textContent = wallAudio.enabled ? "Sound on" : "Sound off";
  $("sound-toggle").setAttribute("aria-pressed",wallAudio.enabled);
  $("sound-volume").value = Math.round(wallAudio.volume*100);
}
$("sound-toggle").onclick=async ()=>{
  wallAudio.update(!wallAudio.enabled,wallAudio.volume);
  renderSoundSettings();
  if (wallAudio.ctx?.state==="suspended" && wallAudio.enabled) {
    await wallAudio.ctx.resume().catch(()=>{});
  }
  wallAudio.play("toggle");
};
$("sound-volume").oninput=event=>wallAudio.update(wallAudio.enabled,Number(event.target.value)/100);
$("sound-volume").onchange=()=>wallAudio.play("toggle");
renderSoundSettings();
$("save-menu").onclick=()=>{$("save-message").textContent="";$("save-dialog").showModal();};
$("export").onclick=()=>{
  const url=URL.createObjectURL(new Blob([serialize()],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;
  link.download="wall-smacker-save.json";
  link.click();
  wallAudio.play("save");
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$("import").onclick=()=>$("save-file").click();
function replaceState(state,message) {
  s=state;
  run=newRun();
  $("log").replaceChildren();
  $("float").replaceChildren();
  $("wall-debris").replaceChildren();
  $("fracture-debris").replaceChildren();
  $("last-hit").textContent="Click or press Space";
  note(message,true);
  save();
  render();
}
$("save-file").onchange=async event=>{
  const file=event.target.files[0];
  if (!file) return;
  try {
    if (file.size>100000) throw Error("Invalid save");
    const state=decode(await file.text());
    replaceState(state,"Save imported");
    wallAudio.play("load");
    $("save-message").textContent="Save imported.";
  } catch { wallAudio.play("error"); $("save-message").textContent="This file is not a valid Wall Smacker save."; }
  event.target.value="";
};
$("reset").onclick=()=>{
  if (!window.confirm("Reset all Wall Smacker progress?")) return;
  replaceState(fresh(),"Game reset");
  $("save-dialog").close();
};
window.addEventListener("pagehide",save);
document.addEventListener("visibilitychange",()=>{if (document.hidden) save();});
setInterval(tick,33);
setInterval(save,3000);
note(s.manual ? "Welcome back to Wall "+s.wall : "10 billion HP. Start with one punch.");
render();
