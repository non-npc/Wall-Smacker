"use strict";
const branches = [
  ["Power", [
    ["harder","Punch Harder","Adds 1% base damage and 2% base TP per level. First level is free at 25 punches."],
    ["plant","Plant Your Feet","+15% manual damage per level on the first punch after a 2-second pause."],
    ["hip","Hip Rotation","+12% damage per level on clean hits."],
    ["drive","Drive Through","+12% damage per level on steel, supports and core."],
    ["body","Full-Body Strike","+35% damage per level on every tenth hit."],
    ["force","Maximum Force","+50% damage per level on charged punches."]
  ]],
  ["Speed", [
    ["quick","Quick Hands","+10% routine speed per level."],
    ["windup","Short Windup","Charge a punch faster. Unlocks the Charge Punch button."],
    ["recovery","Fast Recovery","Reduce the charge button's cooldown."],
    ["jabs","Rapid Jabs","Every fifth hit adds +10% damage per level."],
    ["burst","Burst Speed","+20% Flurry Drill damage per level."],
    ["wind","Second Wind","+9% routine speed per level during combos of 30 or more."]
  ]],
  ["Precision", [
    ["rhythm","Find Your Rhythm","Opens the timing bar. Each level widens the clean zone."],
    ["align","Wrist Alignment","+2 percentage points of crit chance per level."],
    ["aim","Aim for the Seam","+25% weak-spot damage per level."],
    ["read","Read the Surface","Keep weak spots open longer."],
    ["pin","Pinpoint Strike","Clean hits on weak spots always crit and deal +10% damage per level."],
    ["perfect","Perfect Impact","Adds 25% of normal hit damage per level to weak-spot criticals."]
  ]],
  ["Endurance", [
    ["stamina","Stamina","Increases the flurry meter capacity."],
    ["pacing","Pacing","Restore flurry energy faster."],
    ["breath","Steady Breathing","Extend the time before a combo expires."],
    ["shoulders","Loose Shoulders","Reduce flurry energy spent per burst."],
    ["reserves","Deep Reserves","Store extra flurry energy and start each wall with more."],
    ["marathon","Marathon Form","+10% sustained auto damage per level once an auto streak builds up."]
  ]],
  ["Combos", [
    ["pair","One-Two","+15% damage per level on even-numbered combo hits."],
    ["follow","Follow-Through","Adds up to +15% damage per level as the combo grows."],
    ["double","Double Tap","Clean manual hits add +10% damage per level."],
    ["keep","Keep It Going","Adds a grace period to combos."],
    ["chain","Chain Reaction","+25% damage per level on every tenth combo hit."],
    ["finish","Finisher","Spend a combo of at least 15 on one powerful hit."]
  ]],
  ["Wall damage", [
    ["surface","Surface Cracks","+10% damage per level after a layer has taken 10% damage."],
    ["same","Hit the Same Spot","+8% damage per level at a combo of 10 or more."],
    ["stress","Stress Fracture","Heavy hits fill crack events faster."],
    ["spread","Spread the Cracks","Start subsequent layers with a temporary damage bonus."],
    ["buckle","Buckle","Charged hits briefly weaken the layer."],
    ["support","Break the Support","Adds 25% of the breaching hit per level as extra damage."]
  ]],
  ["Focus", [
    ["focus","Concentration","Clean hits generate Focus. Higher levels generate more."],
    ["composure","Composure","Slows Focus decay."],
    ["control","Controlled Power","Spend 20 Focus to empower your next punch."],
    ["target","Target Lock","Spend 25 Focus to extend an exposed weak spot."],
    ["flow","Flow State","Boost clean hits when Focus is at least 50."],
    ["all","All In","Spend your entire Focus bar for a heavy strike. Requires 30 Focus."]
  ]]
];
const branchEntry = {
  quick:{drill:5}, rhythm:{plant:3}, stamina:{alternate:1},
  pair:{drill:1}, surface:{harder:7}, focus:{precision:1}
};
const extraRequirements = {
  hip:{rhythm:1}, windup:{strength:1}, jabs:{alternate:5}, aim:{footwork:1},
  breath:{breathing:1}, shoulders:{flurry:1}, marathon:{relentless:1},
  stress:{heavy:5}, pin:{precision:5}, flow:{focusDrill:5}
};
const upgrades = branches.flatMap(([branch, entries]) => entries.map(([id,name,description], index) => ({
  id,name,description,branch,max:id==="harder" ? 45 : 10,
  req:{...(index ? {[entries[index-1][0]]:id==="plant" ? 5 : index>=4 ? 10 : 5} : branchEntry[id]),
    ...extraRequirements[id]}
})));
const routineRows = [
  ["drill","Punching Drill","Regular automatic punches. At Lv. 5, every fifth strike is clean.",3.2,1],
  ["strength","Strength Training","Builds power for your next heavy hit.",9,0],
  ["timing","Timing Practice","Makes the next automatic punch clean.",8,0],
  ["alternate","Alternating Hands","Throws a quick pair of punches.",4.5,.75],
  ["breathing","Breathing Drill","Refreshes the combo timer while a combo is active.",4,0],
  ["footwork","Footwork Practice","Speeds up the arrival of the next wall event.",8,0],
  ["heavy","Heavy Punch Drill","Delivers a slow, heavy punch.",6,3],
  ["repeat","Repetition Drill","Deals extra damage at a combo of 10 or more.",4,1.2],
  ["conditioning","Conditioning","Refills the flurry meter.",5,0],
  ["precision","Precision Drill","Lands a clean hit. At Lv. 5 it holds for a weak spot, up to five seconds.",5,2],
  ["flurry","Flurry Drill","Spends flurry energy to deliver four punches.",5,1],
  ["focusDrill","Focus Practice","Generates Focus while automatic play is running.",5,0],
  ["seam","Seam Work","Heavy strikes that push crack events along.",4,3],
  ["pressure","Pressure Rhythm","Alternates quick hits and heavy strikes.",2.2,1.6],
  ["impact","Impact Practice","Charges a heavy blow with a bonus against resistant layers.",7,6],
  ["counter","Counter Rhythm","Adds a follow-up punch after qualifying heavy crits.",0,1.5],
  ["relentless","Relentless Form","Gains speed over a sustained automatic streak.",3,2],
  ["finishDrill","Finisher Drill","Automatically spends a combo of 25 or more on a heavy hit.",5,5]
];
const routines = routineRows.map(([id,name,description,interval,mult], index) => ({
  id,name,description,interval,mult,max:15,routine:true,
  base:Math.round(65*1.24**index),
  req:id==="finishDrill" ? {finish:1} : index ? {[routineRows[index-1][0]]:index<3 ? 1 : index<8 ? 5 : 10} : {harder:5}
}));
routines.push({
  id:"autoCharge",name:"Charged Punch Routine",
  description:"Automatically charges and releases the charged punch whenever it is ready.",
  interval:0,mult:0,max:1,routine:true,base:180,req:{windup:1}
});
for (const [id,name,description,base,ability] of [
  ["autoControl","Controlled Power Routine","Spends 20 Focus to empower the next hit.",220,"control"],
  ["autoTarget","Target Lock Routine","Spends 25 Focus to extend each weak spot once, just before it expires.",260,"target"],
  ["autoAll","All In Routine","Spends all Focus on a heavy hit at 99 Focus or higher. Allows one automatic Controlled Power before saving for the next All In.",340,"all"]
]) {
  routines.push({id,name,description,base,interval:0,mult:0,max:1,routine:true,req:{[ability]:1}});
}
const itemIcons = {
  autoCharge:"⚡", autoControl:"✋", autoTarget:"⊕", autoAll:"✺",
  harder:"✊", plant:"👣", hip:"↻", drive:"➜", body:"✦", force:"💥",
  quick:"⚡", windup:"⏱", recovery:"⤴", jabs:"»", burst:"☄", wind:"〰",
  rhythm:"♫", align:"⌖", aim:"◈", read:"◉", pin:"🎯", perfect:"✧",
  stamina:"♥", pacing:"◷", breath:"≈", shoulders:"↔", reserves:"▣", marathon:"∞",
  pair:"Ⅱ", follow:"➤", double:"✌", keep:"⛓", chain:"⟲", finish:"⚑",
  surface:"◩", same:"⊙", stress:"ϟ", spread:"⤢", buckle:"⬓", support:"◆",
  focus:"◎", composure:"◇", control:"✋", target:"⊕", flow:"∿", all:"✺",
  drill:"✊", strength:"💪", timing:"♩", alternate:"⇄", breathing:"≈", footwork:"👣",
  heavy:"🔨", repeat:"⟳", conditioning:"♥", precision:"🎯", flurry:"»", focusDrill:"◎",
  seam:"◈", pressure:"⏱", impact:"💥", counter:"↩", relentless:"⚡", finishDrill:"⚑"
};
const itemById = Object.fromEntries([...upgrades,...routines].map(item => [item.id,item]));
const items = [...upgrades,...routines];
// All upgrade branches share one starting price per prerequisite stage.
function unlockDepth(item) {
  return Math.max(0,...Object.keys(item.req).map(id=>1+unlockDepth(itemById[id])));
}
for (const item of items) {
  const depth = unlockDepth(item);
  if (!item.routine) item.base = depth ? 110+20*depth : 30;
  // Keep the opening accessible and scale prices as prerequisite chains deepen.
  item.base = Math.ceil(item.base*1.32**Math.max(0,depth-3));
  if (item.routine && item.max===1) item.base = Math.max(item.base, itemById[Object.keys(item.req)[0]].base*2);
}

const materials = [
  {name:"Concrete",end:.02,tip:"All punches deal full damage."},
  {name:"Steel Mesh",end:.20,tip:"High combos cut through the mesh."},
  {name:"Reinforced Supports",end:.60,tip:"Heavy punches deal 65% more damage."},
  {name:"The Core",end:1,tip:"Weak-spot hits and criticals hit harder."}
];
const achievements = [
  ["warmup","Warm-up","Throw 25 manual punches.",s=>s.manual>=25,2],
  ["rhythmic","In the Groove","Land 5 clean manual hits in a row.",s=>s.cleanBest>=5,10],
  ["century","Hundred Hands","Throw 100 automatic punches.",s=>s.autoHits>=100,15],
  ["combo","Unbroken Rhythm","Reach a combo of 50.",s=>s.bestCombo>=50,30],
  ["crack","Crack Opener","Complete 3 crack events.",s=>s.cracks>=3,30],
  ["weak","Dead Center","Hit 10 exposed weak spots.",s=>s.weakHits>=10,40],
  ["million","Million Pound Punch","Deal 1 million damage in one hit.",s=>s.bestHit>=1e6,75],
  ["clear","Wall Smacker","Destroy the first wall.",s=>s.hp===0,150],
  ["again","Rematch","Destroy a second wall.",s=>s.wall>=2 && s.hp===0,250]
];
