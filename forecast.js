/* Pure, independently testable cycle and mood helpers. No database access. */
(function(global){
  'use strict';
  const MS = 86400000;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function dayNumber(str){
    if(typeof str!=='string'||!DAY_RE.test(str)) return NaN;
    const [y,m,d]=str.split('-').map(Number);
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) return NaN;
    return dt.getTime()/MS;
  }
  function dateFromNumber(n){return new Date(n*MS).toISOString().slice(0,10)}
  function addDays(str,n){return dateFromNumber(dayNumber(str)+n)}
  function differenceDays(a,b){return dayNumber(a)-dayNumber(b)}
  function median(nums){if(!nums.length)return null;const s=[...nums].sort((a,b)=>a-b);const i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2}
  function mean(nums){return nums.reduce((a,b)=>a+b,0)/nums.length}
  function deviation(nums,center){return median(nums.map(x=>Math.abs(x-center)))||0}
  function compute(periods,logs,today){
    const valid=[...new Map((periods||[]).filter(p=>Number.isFinite(dayNumber(p.start_date))&&p.start_date<=today).map(p=>[p.start_date,p])).values()].sort((a,b)=>a.start_date.localeCompare(b.start_date));
    const starts=valid.map(p=>p.start_date);
    const cycleLengths=[];const training=[];
    for(let i=1;i<starts.length;i++){
      const length=differenceDays(starts[i],starts[i-1]);
      if(length>=15 && length<=90){cycleLengths.push(length);training.push({start:starts[i-1],end:starts[i],length})}
    }
    const bleedingLengths=valid.filter(p=>p.end_date&&Number.isFinite(dayNumber(p.end_date)))
      .map(p=>differenceDays(p.end_date,p.start_date)+1).filter(x=>x>0&&x<=15);
    const bleedLen=Math.round(median(bleedingLengths)||5);
    // The history may contain missed entries. Retain the raw intervals for charts,
    // but avoid letting an isolated, unusually long interval dominate the forecast.
    const rawRecent=cycleLengths.slice(-10);
    const center=median(rawRecent);
    const threshold=Math.max(8,3*1.4826*deviation(rawRecent,center));
    const clean=rawRecent.length>=4?rawRecent.filter(n=>Math.abs(n-center)<=threshold):rawRecent;
    const recent=clean.slice(-8);
    const excludedIntervals=rawRecent.length-clean.length;
    let length=null,range=null,reliability='Not enough history',evidence=recent.length,spread=null;
    if(recent.length){
      const weighted=recent.map((v,i)=>({v,w:Math.pow(.84,recent.length-i-1)}));
      const meanWeighted=weighted.reduce((a,b)=>a+b.v*b.w,0)/weighted.reduce((a,b)=>a+b.w,0);
      length=Math.max(15,Math.min(90,Math.round(.65*median(recent)+.35*meanWeighted)));
      spread=deviation(recent,median(recent));
      const backtestErrors=[];
      for(let i=2;i<recent.length;i++){
        const prior=recent.slice(0,i);
        backtestErrors.push(Math.abs(recent[i]-Math.round(median(prior))));
      }
      const err=backtestErrors.length?Math.ceil(median(backtestErrors)):0;
      const pad=Math.min(21,Math.max(recent.length<3?5:2,Math.ceil(1.5*spread),err,excludedIntervals?5:0));
      range=pad;
      reliability=excludedIntervals?'Limited':recent.length>=6&&spread<=2?'Higher':recent.length>=3&&spread<=5?'Moderate':'Limited';
    }
    const latest=valid.at(-1)||null;
    const currentDay=latest?differenceDays(today,latest.start_date)+1:null;
    const nextDate=latest&&length!==null?addDays(latest.start_date,length):null;
    const expectedDays=nextDate?differenceDays(nextDate,today):null;
    const estimatedOvDay=length!==null?Math.max(bleedLen+1,length-14):null;
    const oldPeriodEnd=latest&&latest.end_date?latest.end_date:null;
    let phase='Unknown',phaseTitle='Not enough data',phaseExplanation='Add your period start dates to see a personalized cycle estimate.';
    if(currentDay!==null){
      const isBleeding=oldPeriodEnd?today<=oldPeriodEnd:currentDay<=Math.min(bleedLen,10);
      if(isBleeding&&currentDay<=15){phase='menstrual';phaseTitle='Menstrual phase';phaseExplanation='A period start is recorded. Your needs may change from day to day.'}
      else if(length===null){phaseTitle='Building your baseline';phaseExplanation='Record another period start to learn your typical cycle length.'}
      else if(currentDay>length+Math.max(3,range||0)){
        phaseTitle='Beyond estimated cycle';phaseExplanation='Your predicted period window has passed. Predictions may be less reliable with longer or irregular cycles.';
      }
      else if(currentDay<estimatedOvDay-2){phase='follicular';phaseTitle='Follicular phase';phaseExplanation='This phase is estimated from calendar timing; individual experiences vary.'}
      else if(currentDay<=estimatedOvDay+2){phase='ovulation';phaseTitle='Around estimated ovulation';phaseExplanation='An approximate calendar window, not evidence that ovulation occurred.'}
      else{phase='luteal';phaseTitle='Luteal phase';phaseExplanation='This phase is estimated; mood and energy do not follow a fixed pattern for everyone.'}
    }
    const forecast=nextDate?{
      date:nextDate,earliest:addDays(nextDate,-range),latest:addDays(nextDate,range),daysUntil:expectedDays,
      length,variability:spread,reliability,intervals:evidence
    }:null;
    const mood=expectedDays!==null&&expectedDays<-(range||0)?
      {label:'Needs a new check-in',description:'Your last period forecast is past its expected window. Record your latest start before considering a new mood outlook.',evidence:'Forecast needs updating',counts:countMoods(logs||[]),total:(logs||[]).filter(l=>l.mood).length,qualified:false}:
      estimateMood(logs||[],valid,training,latest,currentDay,length);
    return {starts,valid,cycleLengths,bleedingLengths,bleedLen,recent,excludedIntervals,forecast,currentDay,phase,phaseTitle,phaseExplanation,estimatedOvDay,mood,latest};
  }
  function countMoods(logs){
    const names=['Happy','Calm & Balanced','Anxious / Stressed','Irritable','Fatigued'];
    return Object.fromEntries(names.map(name=>[name,logs.filter(l=>l.mood===name).length]));
  }
  function estimateMood(logs,periods,training,latest,currentDay,predictedLength){
    const moodNames=['Happy','Calm & Balanced','Anxious / Stressed','Irritable','Fatigued'];
    const known=new Set(moodNames);
    const counts=Object.fromEntries(moodNames.map(s=>[s,0]));
    const trainingPoints=[];
    for(const log of logs){
      if(!known.has(log.mood)||!Number.isFinite(dayNumber(log.log_date)))continue;
      counts[log.mood]++;
      const cycle=training.find(t=>log.log_date>=t.start&&log.log_date<t.end);
      if(!cycle)continue;
      const relative=differenceDays(log.log_date,cycle.start)/cycle.length;
      trainingPoints.push({...cycle,mood:log.mood,relative});
    }
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    if(!latest||!currentDay||!predictedLength||total<8){return {label:'Still learning',description:'Add more mood check-ins across cycles to discover your own patterns.',evidence:`${total} mood logs recorded`,counts,total,qualified:false}}
    const relative=(currentDay%predictedLength)/predictedLength;
    const near=trainingPoints.filter(p=>{const d=Math.abs(p.relative-relative);return Math.min(d,1-d)<=.15});
    const distinct=new Set(near.map(p=>p.start)).size;
    if(near.length<6||distinct<3){return {label:'Patterns emerging',description:'There are not yet enough comparable days across completed cycles for a useful mood outlook.',evidence:`${near.length} comparable logs in ${distinct} cycles`,counts,total,qualified:false}}
    const nCounts=Object.fromEntries(moodNames.map(s=>[s,near.filter(x=>x.mood===s).length]));
    const sorted=moodNames.slice().sort((a,b)=>nCounts[b]-nCounts[a]);
    const winner=sorted[0],freq=nCounts[winner]/near.length,base=counts[winner]/total;
    if(freq<.4||freq-base<.12){return {label:'Mood may vary',description:'No strong recurring mood pattern stands out for this point in your cycle.',evidence:`Compared ${near.length} entries across ${distinct} cycles`,counts,total,qualified:false}}
    const friendly={'Calm & Balanced':'Calm','Anxious / Stressed':'Stressed','Fatigued':'Tired','Happy':'Happy','Irritable':'Irritable'};
    return {label:`Often ${friendly[winner].toLowerCase()}`,description:`You recorded ${friendly[winner].toLowerCase()} on ${nCounts[winner]} of ${near.length} similar days. Your mood may be different this time.`,evidence:`Based on ${distinct} completed cycles`,counts,total,qualified:true};
  }
  function markedDates(metrics,periods,today){
    const recorded=new Set(),predicted=new Set(),ovulation=new Set();
    for(const p of periods){
      if(!Number.isFinite(dayNumber(p.start_date))||p.start_date>today)continue;
      // An open cycle is not automatically marked as continuously bleeding.
      const end=p.end_date&&Number.isFinite(dayNumber(p.end_date))?p.end_date:addDays(p.start_date,Math.min(metrics.bleedLen,10)-1);
      const until=Math.min(dayNumber(today),dayNumber(end));
      for(let n=dayNumber(p.start_date);n<=until&&n<dayNumber(p.start_date)+16;n++)recorded.add(dateFromNumber(n));
    }
    if(metrics.forecast){
      const base=metrics.forecast;
      for(let n=dayNumber(base.earliest);n<=dayNumber(base.latest)+metrics.bleedLen-1;n++){
        const date=dateFromNumber(n);if(date>today&&!recorded.has(date))predicted.add(date);
      }
      const approx=addDays(base.date,-14);
      for(let d=-2;d<=2;d++){const date=addDays(approx,d);if(date>today&&!recorded.has(date)&&!predicted.has(date))ovulation.add(date)}
    }
    return {recorded,predicted,ovulation};
  }
  global.IfahForecast={dayNumber,dateFromNumber,addDays,differenceDays,median,compute,markedDates};
})(window);
