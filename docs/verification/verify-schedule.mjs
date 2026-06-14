// Verifies the encoded base parenting schedule against the realized overnights
// read from the current app's month views (Nov 2025 – May 2026).
// Green = Jason Clearman (Dad), Blue = Lesley Barrett (Mom).
// Run: node verify-schedule.mjs

function parseISO(d){const[y,m,day]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,day));}
function diffDays(a,b){return Math.round((parseISO(b)-parseISO(a))/86400000);}
function mod(n,m){return((n%m)+m)%m;}

// The encoded base school-year rotation (see config in 0002_real_parenting_schedule.sql)
const cfg = {
  anchorDate: '2026-01-01',                                   // a Thursday; index 0 of cycle
  pattern: ['A','A','A','A','A','B','B','B','B','B','B','B','B','B'], // A=Dad, B=Mom
};
const resolve = (iso) =>
  cfg.pattern[mod(diffDays(cfg.anchorDate, iso), cfg.pattern.length)] === 'A' ? 'DAD' : 'MOM';

// Ground truth: Dad (green) days read off each screenshot.
const green = {
  '2025-11':[6,7,8,9,10,20,21,22,23,24],
  '2025-12':[4,5,6,7,8,18,19,20,21,22],
  '2026-01':[1,2,3,4,5,15,16,17,18,19,29,30,31],
  '2026-02':[1,2,12,13,14,15,16,26,27,28],
  '2026-03':[1,2,12,13,14,15,16,26,27,28,29,30],
  '2026-04':[9,10,11,12,13,23,24,25,26,27],
  '2026-05':[7,8,9,10,11,21,22,23,24,25],
};
const lastDay = {'2025-11':30,'2025-12':31,'2026-01':31,'2026-02':28,'2026-03':31,'2026-04':30,'2026-05':31};

let ok = true;
for (const ym of Object.keys(green)) {
  const [y,m] = ym.split('-');
  const computed = [];
  for (let d=1; d<=lastDay[ym]; d++)
    if (resolve(`${y}-${m}-${String(d).padStart(2,'0')}`)==='DAD') computed.push(d);
  const exp = green[ym];
  const same = computed.length===exp.length && computed.every((v,i)=>v===exp[i]);
  ok = ok && same;
  console.log(`${ym}: ${same ? 'MATCH ✓' : 'MISMATCH ✗'}`);
  if (!same) { console.log('  computed:', computed.join(',')); console.log('  expected:', exp.join(',')); }
}
console.log(`\nAll months match: ${ok ? 'YES ✓' : 'NO ✗'}`);
