// Print the case contents as markdown tables (docs/rewards.md "Items"): node scripts/rewards-table.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const B = '../src/profile/';
const R = await import(B+'rewards.js'); const { RARITIES } = await import(B+'rarity.js'); const { SERIES, SERIES_ORDER } = await import(B+'items.js');
const C = await import(B+'catalog.js');
const look=(v)=>{const c=v.colors||{};return [c.pat&&c.pat!=='none'?c.pat:'',c.finish||'',c.decal?`decal ${c.decal}`:'',c.iri?'iridescent lens':'',c.onePiece?'one-piece':''].filter(Boolean).join(', ');};
for (const s of SERIES_ORDER){const pool=R.casePool(s);const odds=R.caseOdds(s);console.log(`\n### ${SERIES[s].name}\n\n| Grade | Odds | Items |\n|---|---|---|`);
for (const r of RARITIES.slice(0,5)){console.log(`| ${r.name} (${r.short.toLowerCase()}) | ${odds[r.id]} % | ${pool[r.id].map(e=>`${e.item.name} \| ${e.variant.name}${look(e.variant)?` (${look(e.variant)})`:''}`).join(', ')} |`);}}
const g=R.casePool('first-chair').gold;console.log(`\n### ★ Exceedingly rare (both cases, 0.3 %)\n`);console.log(g.map(e=>`- ${e.item.name} | ${e.variant.name} (${e.item.slot}, \`${e.item.model.ref}\`)`).join('\n'));
const all=C.rewardSkins();console.log('\ntotal',all.length, Object.fromEntries(RARITIES.map(r=>[r.id,all.filter(x=>x.variant.rarity===r.id).length])), 'byslot', JSON.stringify(Object.fromEntries(Object.keys(C.SLOTS).map(sl=>[sl,all.filter(x=>x.item.slot===sl).length]))));
