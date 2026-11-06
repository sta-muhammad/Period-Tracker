// Run with: node tests/forecast.test.js
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx={window:{},Date,Math};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../forecast.js'),'utf8'),ctx);
const F=ctx.window.IfahForecast;
const p=(start,end=null)=>({start_date:start,end_date:end});
assert.equal(F.dayNumber('2024-02-29')+1,F.dayNumber('2024-03-01'));
assert.ok(Number.isNaN(F.dayNumber('2024-02-30')));
assert.equal(F.addDays('2026-12-31',1),'2027-01-01');
let m=F.compute([p('2026-11-01')],[],'2026-11-06');
assert.equal(m.forecast,null);
assert.equal(m.currentDay,6);
m=F.compute([p('2026-09-01','2026-09-05'),p('2026-09-29','2026-10-03'),p('2026-10-27','2026-10-31')],[],'2026-11-06');
assert.equal(m.forecast.length,28);
assert.equal(m.forecast.date,'2026-11-24');
assert.equal(m.forecast.intervals,2);
assert.equal(m.phase,'follicular');
assert.equal(m.mood.qualified,false);
const periods=[p('2026-01-01','2026-01-05'),p('2026-01-29','2026-02-02'),p('2026-02-26','2026-03-02'),p('2026-03-26','2026-03-30'),p('2026-04-23','2026-04-27'),p('2026-05-21','2026-05-25'),p('2026-06-18','2026-06-22'),p('2026-09-16','2026-09-20')];
m=F.compute(periods,[],'2026-09-20');
assert.equal(m.excludedIntervals,1); // 90-day interval could be a missed entry
assert.ok(m.forecast.length<=30);
assert.equal(m.forecast.reliability,'Limited');
const markings=F.markedDates(m,periods,'2026-09-20');
assert.ok(markings.recorded.has('2026-09-16'));
assert.ok(!markings.recorded.has('2026-09-24'));
console.log('PASS: date rollover, invalid dates, low-data behavior, start-to-start forecast, mood abstention, outlier guard, calendar marks');
