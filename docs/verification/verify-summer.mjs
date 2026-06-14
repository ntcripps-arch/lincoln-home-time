function parseISO(d){const[y,m,day]=d.split('-').map(Number);return new Date(Date.UTC(y,m-1,day));}
function diffDays(a,b){return Math.round((parseISO(b)-parseISO(a))/86400000);}
function mod(n,m){return((n%m)+m)%m;}
function inRange(d,a,b){return d>=a && d<=b;}

// School calendar boundaries (from the PDFs):
const SUMMER_START = '2026-06-13'; // day after last day of school (Jun 12)
const SUMMER_END   = '2026-08-31'; // day before first day of school (Sep 1, 2026)

// BASE school-year rotation (already in the app): Dad Thu->Mon (5 nights) e/o week.
function base(iso){ return mod(diffDays('2026-01-01', iso),14) < 5 ? 'DAD' : 'MOM'; }

// SUMMER override: every-other-week, Friday->Friday exchange (Dad Fri..Thu = 7 nights).
// Even year (2026) => Dad first full summer week. Anchor 2026-07-03 is a confirmed
// Dad Friday from the screenshots; going back 14 days => Dad week starts Jun 19.
function summer(iso){ return mod(diffDays('2026-07-03', iso),14) < 7 ? 'DAD' : 'MOM'; }

function resolve(iso){
  if(inRange(iso, SUMMER_START, SUMMER_END)) return summer(iso);
  return base(iso);
}

// Ground truth: Dad/green days read off the June–Sept 2026 screenshots.
// (June's middle week is the school->summer handoff; encoded as the Friday model predicts.)
const green = {
  '2026-06':[4,5,6,7,8, 19,20,21,22,23,24,25],
  '2026-07':[3,4,5,6,7,8,9, 17,18,19,20,21,22,23, 31],
  '2026-08':[1,2,3,4,5,6, 14,15,16,17,18,19,20, 28,29,30,31],
  '2026-09':[10,11,12,13,14, 24,25,26,27,28],
};
const last = {'2026-06':30,'2026-07':31,'2026-08':31,'2026-09':30};

let ok=true;
for(const ym of Object.keys(green)){
  const [y,m]=ym.split('-'); const comp=[];
  for(let d=1; d<=last[ym]; d++){
    const iso=`${y}-${m}-${String(d).padStart(2,'0')}`;
    if(resolve(iso)==='DAD') comp.push(d);
  }
  const exp=green[ym];
  const same = comp.length===exp.length && comp.every((v,i)=>v===exp[i]);
  ok=ok&&same;
  console.log(`${ym}: ${same?'MATCH ✓':'MISMATCH ✗'}`);
  if(!same){console.log('  computed:',comp.join(',')); console.log('  expected:',exp.join(','));}
}
console.log('\nAll summer/transition months match:', ok?'YES ✓':'NO ✗');

// show the handoff days explicitly
console.log('\nTransition detail:');
for(const d of ['2026-06-08','2026-06-12','2026-06-13','2026-06-18','2026-06-19','2026-08-31','2026-09-01','2026-09-10']){
  console.log(' ', d, '->', resolve(d), inRange(d,SUMMER_START,SUMMER_END)?'(summer)':'(school-yr)');
}
