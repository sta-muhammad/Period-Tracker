/* Ifah v2 — GitHub Pages + existing Supabase periods/daily_logs tables.
   No schema changes, authentication migration, offline store, or background sync. */
(() => {
  'use strict';
  const F = window.IfahForecast;
  const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
  const $ = id => document.getElementById(id);
  const todayISO = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  };
  const TODAY = todayISO();
  const longDate = date => date && Number.isFinite(F.dayNumber(date)) ?
    new Date(F.dayNumber(date)*86400000).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}) : 'Unknown date';
  const shortDate = date => date && Number.isFinite(F.dayNumber(date)) ?
    new Date(F.dayNumber(date)*86400000).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'}) : '—';
  const weekday = date => new Date(F.dayNumber(date)*86400000).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long'});
  const slug = str => String(str||'').toLowerCase().trim();
  const moodLabels = {'Happy':'Happy','Calm & Balanced':'Calm','Anxious / Stressed':'Stressed','Irritable':'Irritable','Fatigued':'Tired'};
  const symptomNames = ['Headache','Bloating','Back pain','Cravings','Acne','Breast tenderness','Low energy','Trouble sleeping'];
  const choices = {mood:null,flow:null,severity:null};
  let selectedSymptoms = new Set(), db = null, toastHandle = null;
  const state = {periods:[],logs:[],metrics:null,marked:null,selectedDate:TODAY,
    month:new Date(Number(TODAY.slice(0,4)),Number(TODAY.slice(5,7))-1,1),
    view:'home',historyTab:'periods',historySearch:'',loading:false};

  function toast(message, duration=3400) {
    const el = $('toast');el.textContent=message;el.hidden=false;
    if(toastHandle)clearTimeout(toastHandle);
    toastHandle=setTimeout(()=>{el.hidden=true},duration);
  }
  function status(kind,message){
    const el=$('sync-status');el.dataset.state=kind;
    el.lastChild.textContent=message;
    $('connection-banner').hidden = kind!=='error';
    if(kind==='error')$('connection-message').textContent=message;
  }
  function setTheme(theme){
    document.documentElement.dataset.theme=theme;
    $('theme-button').innerHTML=theme==='dark'?'<svg class="icon"><use href="#ic-sun"/></svg>':'<svg class="icon"><use href="#ic-moon"/></svg>';
    try{localStorage.setItem('ifah-theme',theme)}catch(_){}
  }
  function navigate(view){
    const next=$('view-'+view);if(!next)return;
    state.view=view;
    document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el===next));
    document.querySelectorAll('.nav-link').forEach(btn=>{
      const active=btn.dataset.go===view;btn.classList.toggle('active',active);
      if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');
    });
    if(view==='calendar')renderCalendar();
    if(view==='history')renderHistory();
    if(view==='log')loadLogForm(state.selectedDate<=TODAY?state.selectedDate:TODAY);
    window.scrollTo({top:0,behavior:'instant'});
  }
  function updateAll(){
    state.periods.sort((a,b)=>b.start_date.localeCompare(a.start_date));
    state.logs.sort((a,b)=>b.log_date.localeCompare(a.log_date));
    state.metrics=F.compute(state.periods,state.logs,TODAY);
    state.marked=F.markedDates(state.metrics,state.periods,TODAY);
    renderHome();renderCalendar();renderInsights();renderHistory();
    if(state.view==='log')loadLogForm($('log-date').value||TODAY);
  }
  async function readAll(table,dateField){
    const collected=[];let offset=0;
    // Supabase/PostgREST commonly returns 1000 rows per query; paginate to retain ALL history.
    for(let page=0;page<200;page++){
      const {data,error}=await db.from(table).select('*').order(dateField,{ascending:false}).range(offset,offset+999);
      if(error)throw error;
      const rows=data||[];collected.push(...rows);
      if(rows.length<1000)break;
      offset+=1000;
      if(page===199)throw new Error('Too many records to load safely; please contact the developer.');
    }
    return collected;
  }
  async function fetchData(){
    if(state.loading)return;
    state.loading=true;$('refresh-button').disabled=true;
    status(DEMO?'ok':'loading',DEMO?'Preview data':'Refreshing…');
    try{
      if(DEMO){const demo=getDemoData();state.periods=demo.periods;state.logs=demo.logs;}
      else{
        if(!db)throw new Error('Supabase library is unavailable. Check your internet connection and reload.');
        const [periods,logs]=await Promise.all([readAll('periods','start_date'),readAll('daily_logs','log_date')]);
        state.periods=periods;state.logs=logs;
      }
      updateAll();status('ok',DEMO?'Preview data':'Up to date');
    }catch(err){console.error('Ifah data load failed',err);status('error',`Unable to load your records: ${err.message||err}`)}
    finally{state.loading=false;$('refresh-button').disabled=false}
  }
  async function request(query){
    if(DEMO)return;
    const {error}=await query;
    if(error)throw error;
  }
  async function performChange(action,successMessage){
    if(state.loading)return;
    try{
      await action();
      if(!DEMO)await fetchData();else updateAll();
      toast(successMessage);
    }catch(err){console.error(err);toast(`Could not save: ${err.message||err}`,6000);throw err;}
  }
  function create(tag,cls,txt){const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=String(txt);return el}
  function renderHome(){
    const m=state.metrics;const forecast=m.forecast;
    $('today-label').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
    const shortPhases={menstrual:'Menstrual',follicular:'Follicular',ovulation:'Ovulation estimate',luteal:'Luteal'};
    $('phase-pill').textContent=shortPhases[m.phase]||(m.currentDay===null?'Getting to know you':'Timing uncertain');
    $('phase-title').textContent=m.phaseTitle;
    $('phase-explanation').textContent=m.phaseExplanation;
    $('cycle-day').textContent=m.currentDay===null?'—':m.currentDay;
    $('cycle-of').textContent=forecast?`of ~${forecast.length} days`:'your own timeline';
    const circumference=2*Math.PI*84;
    const progress=m.currentDay&&forecast?Math.max(.015,Math.min(m.currentDay/forecast.length,1)):0;
    $('cycle-progress').style.strokeDasharray=String(circumference);
    $('cycle-progress').style.strokeDashoffset=String(circumference*(1-progress));
    if(forecast){
      const outdated=forecast.daysUntil < -Math.max(3,F.differenceDays(forecast.latest,forecast.date));
      $('period-value').textContent=outdated?'Update needed':shortDate(forecast.date);
      $('period-detail').textContent=outdated?`Last estimate: ${shortDate(forecast.date)}`:forecast.daysUntil<0?`${Math.abs(forecast.daysUntil)} days past estimate`:
        forecast.daysUntil===0?'Estimated for today':`Estimated in ${forecast.daysUntil} day${forecast.daysUntil===1?'':'s'}`;
      $('forecast-reliability').textContent=`Range ${shortDate(forecast.earliest)}–${shortDate(forecast.latest)} · ${forecast.reliability.toLowerCase()} reliability`;
    } else {
      $('period-value').textContent='Not yet';$('period-detail').textContent='Record a second period start';
      $('forecast-reliability').textContent='Waiting for cycle history';
    }
    $('mood-value').textContent=m.mood.label;
    $('mood-detail').textContent=m.mood.description;
    $('mood-evidence').textContent=m.mood.evidence;
    $('overview-periods').textContent=state.periods.length;
    $('overview-logs').textContent=state.logs.length;
    $('overview-cycle').textContent=forecast?`${forecast.length} days`:'—';
    const recent=state.logs.find(l=>l.log_date===TODAY);
    $('todays-entry').textContent=recent?(recent.mood?`Today: ${moodLabels[recent.mood]||recent.mood}`:'Today’s check-in saved'):'No check-in recorded today';
    document.querySelectorAll('#quick-moods button').forEach(btn=>btn.classList.toggle('is-active',Boolean(recent&&recent.mood===btn.dataset.mood)));
    if(m.recent.length>=3){
      const lo=Math.min(...m.recent),hi=Math.max(...m.recent);
      $('insight-home-title').textContent=hi-lo<=3?'A rhythm worth noticing.':'Your rhythm has its own range.';
      $('insight-home-description').textContent=`Your last ${m.recent.length} recorded cycles ranged from ${lo} to ${hi} days. We use that history to keep estimates personal.`;
    }else if(m.recent.length){
      $('insight-home-title').textContent='Your story is taking shape.';
      $('insight-home-description').textContent=`You have ${m.recent.length} completed start-to-start interval${m.recent.length===1?'':'s'}. A few more will help us estimate your usual range.`;
    }else{
      $('insight-home-title').textContent='Your pattern, your pace.';
      $('insight-home-description').textContent='As you track new period starts and daily check-ins, this space will become more personal.';
    }
  }
  function addMonths(month,offset){return new Date(month.getFullYear(),month.getMonth()+offset,1)}
  function renderCalendar(){
    const {month,selectedDate,marked}=state;if(!marked)return;
    $('calendar-month').textContent=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const grid=$('calendar-grid');grid.replaceChildren();
    const year=month.getFullYear(),mon=month.getMonth();
    const offset=(new Date(year,mon,1).getDay()+6)%7;
    const total=new Date(year,mon+1,0).getDate();
    for(let i=0;i<offset;i++)grid.appendChild(create('span','calendar-cell blank'));
    for(let day=1;day<=total;day++){
      const iso=[year,String(mon+1).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
      const btn=create('button','calendar-cell',day);btn.type='button';btn.dataset.date=iso;
      const statuses=[];
      if(marked.recorded.has(iso)){btn.classList.add('recorded');statuses.push('recorded period')}
      else if(marked.predicted.has(iso)){btn.classList.add('predicted');statuses.push('period estimate')}
      else if(marked.ovulation.has(iso)){btn.classList.add('ovulation');statuses.push('estimated ovulation window')}
      const log=state.logs.find(l=>l.log_date===iso);
      if(log){const marker=create('span','tiny-log');marker.setAttribute('aria-hidden','true');btn.appendChild(marker);statuses.push('daily check-in')}
      if(iso===TODAY){btn.classList.add('today');statuses.push('today')}
      if(iso===selectedDate){btn.classList.add('selected');btn.setAttribute('aria-pressed','true')}
      btn.setAttribute('aria-label',`${longDate(iso)}${statuses.length?', '+statuses.join(', '):''}`);
      btn.addEventListener('click',()=>{state.selectedDate=iso;renderCalendar()});
      grid.appendChild(btn);
    }
    renderSelectedDay();
  }
  function renderSelectedDay(){
    const date=state.selectedDate,m=state.metrics,marks=state.marked;
    $('selected-day-heading').textContent=`${weekday(date)}, ${longDate(date)}`;
    const area=$('selected-day-content');area.replaceChildren();
    const states=[];
    if(marks.recorded.has(date))states.push('Recorded period day');
    else if(marks.predicted.has(date))states.push('Estimated period window');
    else if(marks.ovulation.has(date))states.push('Estimated ovulation timing');
    if(!states.length)states.push('No period timing marked for this day');
    for(const value of states)area.appendChild(create('span','detail-chip',value));
    const log=state.logs.find(l=>l.log_date===date);
    if(log){
      const p=create('p','muted','Your check-in:');p.style.marginTop='12px';area.appendChild(p);
      if(log.mood)area.appendChild(create('span','detail-chip',moodLabels[log.mood]||log.mood));
      if(log.flow)area.appendChild(create('span','detail-chip',`Flow: ${log.flow}`));
      if(log.severity)area.appendChild(create('span','detail-chip',`Pain: ${log.severity}`));
      if(log.symptoms)area.appendChild(create('p','muted',log.symptoms));
    }else area.appendChild(create('p','muted','No daily check-in recorded.'));
    const future=date>TODAY;
    $('edit-selected-day').disabled=future;
    $('edit-selected-day').textContent=future?'Check-in available on this day':log?'Edit this check-in':'Log this day';
  }
  function renderInsights(){
    const m=state.metrics,f=m.forecast;
    $('stat-cycle').textContent=f?`${f.length} days`:'—';
    $('stat-bleed').textContent=m.bleedingLengths.length?`${m.bleedLen} days`:'—';
    $('stat-variation').textContent=m.recent.length>=2?`${Math.min(...m.recent)}–${Math.max(...m.recent)} days`:'—';
    $('stat-checkins').textContent=state.logs.length;
    const bars=$('cycle-chart');bars.replaceChildren();
    if(!m.recent.length)bars.appendChild(create('p','muted','At least two period start dates are needed for a cycle length chart.'));
    else {
      const lo=Math.min(...m.recent),hi=Math.max(...m.recent);
      m.recent.forEach((n,i)=>{
        const item=create('div','cycle-bar');const val=create('span','bar-value',n);
        const track=create('div','bar-track');const fill=create('div','bar-fill');
        fill.style.height=`${38+(hi===lo?40:62*(n-lo)/(hi-lo))}%`;
        track.appendChild(fill);item.append(val,track,create('span','bar-label',`#${Math.max(1,m.cycleLengths.length-m.recent.length+i+1)}`));bars.appendChild(item);
      });
    }
    $('cycle-chart-note').textContent=m.recent.length?`Showing ${m.recent.length} recent forecast intervals (15–90 days). ${m.excludedIntervals?`${m.excludedIntervals} unusually different interval(s) excluded from this estimate, but not deleted from history.`:''}`:'No intervals recorded yet.';
    const moods=$('mood-chart');moods.replaceChildren();
    const counts=m.mood.counts,total=m.mood.total;
    if(!total)moods.appendChild(create('p','muted','Mood history will appear after your first check-ins.'));
    else{
      for(const [key,label] of Object.entries(moodLabels)){
        const count=counts[key];if(!count)continue;
        const row=create('div','mood-row');const track=create('div','mood-track');const fill=create('div','mood-fill');
        fill.style.width=`${100*count/total}%`;track.appendChild(fill);row.append(create('span','',label),track,create('strong','',count));moods.appendChild(row);
      }
    }
    $('insight-forecast-title').textContent=f?shortDate(f.date):'Learning your cycle';
    $('insight-forecast-text').textContent=f?`Expected around ${longDate(f.date)}, with a possible window of ${shortDate(f.earliest)}–${shortDate(f.latest)}. Real cycles can fall outside this range.`:'Record at least two period starts to generate a history-based estimate.';
    $('insight-forecast-reliability').textContent=f?`${f.reliability} reliability · ${f.intervals} usable cycle interval${f.intervals===1?'':'s'}`:'Reliability: insufficient data';
    $('insight-mood-title').textContent=m.mood.label;
    $('insight-mood-text').textContent=m.mood.description;
    $('insight-mood-evidence').textContent=m.mood.evidence;
  }
  function renderHistory(){
    document.querySelectorAll('.tab-pill').forEach(btn=>{let on=btn.dataset.history===state.historyTab;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on))});
    const list=$('history-list');list.replaceChildren();
    const term=slug(state.historySearch);
    const isPeriods=state.historyTab==='periods';
    const items=(isPeriods?state.periods:state.logs).filter(x=>{
      const text=isPeriods?`${x.start_date} ${x.end_date||''} ${longDate(x.start_date)} ${longDate(x.end_date)}`:
        `${x.log_date} ${longDate(x.log_date)} ${x.flow||''} ${x.severity||''} ${x.mood||''} ${x.symptoms||''}`;
      return slug(text).includes(term);
    });
    if(!items.length){list.appendChild(create('div','empty-panel',term?'No entries match your search.':'No records in this section yet.'));return}
    for(const item of items){
      const card=create('article','history-card');
      const top=create('div','item-top');const main=create('div');
      main.append(create('div','item-date',longDate(isPeriods?item.start_date:item.log_date)));
      main.append(create('div','item-sub',isPeriods?(item.end_date?`Ended ${longDate(item.end_date)}`:'End date not recorded'):'Daily check-in'));
      top.append(main);card.appendChild(top);
      const info=create('div','item-info');
      if(isPeriods){
        const n=item.end_date?F.differenceDays(item.end_date,item.start_date)+1:null;
        if(n&&n>0)info.appendChild(create('span','',`${n} day${n===1?'':'s'}`));
        if(!item.end_date)info.appendChild(create('span','','Open record'));
      }else{
        for(const [prefix,val] of [['Mood',item.mood],['Flow',item.flow],['Pain',item.severity],['Symptoms',item.symptoms]]){
          if(val)info.appendChild(create('span','',`${prefix}: ${val}`));
        }
      }
      card.appendChild(info);
      const actions=create('div','item-actions');
      const edit=create('button','','Edit');edit.type='button';
      edit.addEventListener('click',()=>isPeriods?openPeriodEdit(item):openDailyEdit(item.log_date));
      const del=create('button','','Delete');del.type='button';
      del.addEventListener('click',()=>deleteRecord(isPeriods?'periods':'daily_logs',item));
      actions.append(edit,del);card.appendChild(actions);list.appendChild(card);
    }
  }
  function openDailyEdit(date){state.selectedDate=date;navigate('log');}
  function symptomToFields(value){
    const chunks=String(value||'').split(',').map(s=>s.trim()).filter(Boolean);
    const selected=new Set(),other=[];
    chunks.forEach(part=>{
      const match=symptomNames.find(n=>slug(n)===slug(part));
      if(match)selected.add(match);else other.push(part);
    });
    return {selected,notes:other.join(', ')};
  }
  function setChoice(group,value){
    choices[group]=value||null;
    document.querySelectorAll(`#${group}-choices button`).forEach(btn=>btn.classList.toggle('selected',btn.dataset.value===choices[group]));
    const note=$(`${group}-legacy-note`);
    if(note){const standard=[...document.querySelectorAll(`#${group}-choices button`)].some(btn=>btn.dataset.value===choices[group]);
      note.hidden=standard||!choices[group];
      if(!note.hidden)note.textContent=`Existing saved value “${choices[group]}” will be kept unless changed.`;
    }
  }
  function loadLogForm(date){
    $('log-date').value=date;
    const saved=state.logs.find(l=>l.log_date===date);
    $('log-existing').textContent=saved?'Editing a saved check-in. Your existing answers are loaded below.':'New check-in for this day.';
    ['mood','flow','severity'].forEach(k=>setChoice(k,saved?.[k]||null));
    const fields=symptomToFields(saved?.symptoms);selectedSymptoms=fields.selected;
    $('symptoms-notes').value=fields.notes;
    document.querySelectorAll('#symptom-choices button').forEach(btn=>btn.classList.toggle('selected',selectedSymptoms.has(btn.dataset.value)));
    $('log-status').textContent='';
  }
  function chooseDate(date){if(date>TODAY){toast('Future check-ins are not supported yet.');return}state.selectedDate=date;navigate('log')}
  async function saveDaily(event){
    event.preventDefault();const date=$('log-date').value;
    if(!Number.isFinite(F.dayNumber(date))||date>TODAY){toast('Select a valid date that is not in the future.');return}
    const symptoms=[...selectedSymptoms,$('symptoms-notes').value.trim()].filter(Boolean).join(', ').slice(0,2000)||null;
    const row={log_date:date,mood:choices.mood,flow:choices.flow,severity:choices.severity,symptoms};
    if(!row.mood&&!row.flow&&!row.severity&&!row.symptoms){$('log-status').textContent='Choose at least one detail, or delete an existing log from History.';return}
    $('save-daily').disabled=true;$('log-status').textContent='Saving your check-in…';
    try{
      await performChange(async()=>{
        if(DEMO){const existing=state.logs.findIndex(l=>l.log_date===date);if(existing>=0)state.logs[existing]={...state.logs[existing],...row};else state.logs.unshift({...row,id:`demo-log-${Date.now()}`});}
        else await request(db.from('daily_logs').upsert([row],{onConflict:'log_date'}));
      },'Your check-in has been saved.');
      $('log-status').textContent='Saved successfully.';
      state.selectedDate=date;
    }catch(_){$('log-status').textContent='Save failed. Your selections remain on screen.';}
    finally{$('save-daily').disabled=false}
  }
  function periodConflicts(start,end,excludeId=null){
    if(end&&end<start)return 'Period end cannot be before its start.';
    const periods=state.periods.filter(p=>String(p.id)!==String(excludeId));
    if(periods.some(p=>p.start_date===start))return 'A period with this start date is already recorded.';
    if(periods.some(p=>p.start_date>start&&(!end||end>=p.start_date)))return 'These dates overlap a later recorded period. Check the selected dates.';
    if(periods.some(p=>p.end_date&&p.start_date<start&&p.end_date>=start))return 'This start date overlaps an earlier period.';
    return null;
  }
  async function recordStart(){
    const date=$('period-action-date').value;
    if(!Number.isFinite(F.dayNumber(date))||date>TODAY){toast('Choose a valid past or current date.');return}
    if(state.periods.some(p=>!p.end_date)){toast('Finish the open period first, or edit its dates in History.');return}
    const conflict=periodConflicts(date,null);
    if(conflict){toast(conflict,5000);return}
    $('record-start').disabled=true;
    try{
      await performChange(async()=>{
        if(DEMO)state.periods.unshift({id:`demo-period-${Date.now()}`,start_date:date,end_date:null});
        else await request(db.from('periods').insert([{start_date:date,end_date:null}]));
      },`Period start recorded for ${shortDate(date)}.`);
    }catch(_){}finally{$('record-start').disabled=false}
  }
  async function recordEnd(){
    const date=$('period-action-date').value;
    if(!Number.isFinite(F.dayNumber(date))||date>TODAY){toast('Choose a valid past or current date.');return}
    const candidate=state.periods.filter(p=>!p.end_date&&p.start_date<=date).sort((a,b)=>b.start_date.localeCompare(a.start_date))[0];
    if(!candidate){toast('No open period found before this date. You can edit old records in History.');return}
    const next=state.periods.find(p=>p.start_date>candidate.start_date&&p.start_date<=date);
    if(next){toast('End date overlaps a later period. Please correct the earlier record first.');return}
    if(F.differenceDays(date,candidate.start_date)>30){
      if(!confirm('This period spans more than 30 days. Save this end date anyway?'))return;
    }
    $('record-end').disabled=true;
    try{
      await performChange(async()=>{
        if(DEMO)candidate.end_date=date;
        else await request(db.from('periods').update({end_date:date}).eq('id',candidate.id));
      },`Period end recorded for ${shortDate(date)}.`);
    }catch(_){}finally{$('record-end').disabled=false}
  }
  function openPeriodEdit(record){
    $('edit-period-id').value=record.id;$('edit-period-start').value=record.start_date;
    $('edit-period-end').value=record.end_date||'';$('edit-period-error').textContent='';
    $('edit-period-dialog').showModal();
  }
  async function savePeriodEdit(event){
    event.preventDefault();const id=$('edit-period-id').value,start=$('edit-period-start').value,end=$('edit-period-end').value||null;
    if(!Number.isFinite(F.dayNumber(start))||start>TODAY||end&&(!Number.isFinite(F.dayNumber(end))||end>TODAY)){
      $('edit-period-error').textContent='Choose valid dates no later than today.';return;
    }
    const error=periodConflicts(start,end,id);if(error){$('edit-period-error').textContent=error;return}
    $('save-edit-period').disabled=true;
    try{
      await performChange(async()=>{
        if(DEMO){const record=state.periods.find(p=>String(p.id)===String(id));if(record)Object.assign(record,{start_date:start,end_date:end});}
        else await request(db.from('periods').update({start_date:start,end_date:end}).eq('id',id));
      },'Period record updated.');
      $('edit-period-dialog').close();
    }catch(_){$('edit-period-error').textContent='Could not update the record. Please try again.';}
    finally{$('save-edit-period').disabled=false}
  }
  async function deleteRecord(table,item){
    const date=table==='periods'?item.start_date:item.log_date;
    if(!confirm(`Delete the ${table==='periods'?'period':'daily check-in'} recorded for ${longDate(date)}? This cannot be undone.`))return;
    try{
      await performChange(async()=>{
        if(DEMO){const name=table==='periods'?'periods':'logs';state[name]=state[name].filter(p=>String(p.id)!==String(item.id));}
        else await request(db.from(table).delete().eq('id',item.id));
      },'Entry deleted.');
    }catch(_){}
  }
  function getDemoData(){
    const lengths=[28,29,27,30,28,29,28,30,29];
    let date=F.addDays(TODAY,-lengths.reduce((a,b)=>a+b,0)-16);
    const periods=[],logs=[];
    for(let c=0;c<=lengths.length;c++){
      periods.push({id:`p${c}`,start_date:date,end_date:F.addDays(date,c%3===0?5:4)});
      const moods=['Happy','Calm & Balanced','Anxious / Stressed','Irritable','Fatigued'];
      const cycleLength=lengths[c]||28;
      for(let d=0;d<cycleLength;d+=3){
        const day=F.addDays(date,d);if(day>TODAY)continue;
        const mood=d>cycleLength-8?['Irritable','Fatigued','Anxious / Stressed'][Math.floor(d/3)%3]:moods[(c+d)%2];
        logs.push({id:`l${c}-${d}`,log_date:day,mood,flow:d<5?'Light':null,severity:d<5?'Mild / None':null,symptoms:d%9===0?'Bloating':null});
      }
      date=F.addDays(date,cycleLength);
    }
    return {periods:periods.filter(p=>p.start_date<=TODAY),logs};
  }
  function registerListeners(){
    document.addEventListener('click',event=>{
      const goto=event.target.closest('[data-go]');if(goto){navigate(goto.dataset.go);return}
      const tab=event.target.closest('[data-history]');if(tab){state.historyTab=tab.dataset.history;renderHistory();return}
      const choice=event.target.closest('.choice-list button');
      if(choice){const group=choice.closest('.choice-list').id.replace('-choices','');
        if(group==='symptom'){const val=choice.dataset.value;if(selectedSymptoms.has(val))selectedSymptoms.delete(val);else selectedSymptoms.add(val);choice.classList.toggle('selected',selectedSymptoms.has(val));}
        else setChoice(group,choice.dataset.value===choices[group]?null:choice.dataset.value);
        return;
      }
      const clear=event.target.closest('[data-clear]');if(clear){setChoice(clear.dataset.clear,null);return}
    });
    document.querySelectorAll('#quick-moods button').forEach(btn=>btn.addEventListener('click',()=>{
      state.selectedDate=TODAY;navigate('log');setChoice('mood',btn.dataset.mood);
      $('mood-choices').scrollIntoView({behavior:'smooth',block:'center'});
    }));
    $('prev-month').addEventListener('click',()=>{state.month=addMonths(state.month,-1);renderCalendar()});
    $('next-month').addEventListener('click',()=>{state.month=addMonths(state.month,1);renderCalendar()});
    $('edit-selected-day').addEventListener('click',()=>chooseDate(state.selectedDate));
    $('refresh-button').addEventListener('click',fetchData);
    $('retry-button').addEventListener('click',fetchData);
    $('theme-button').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    $('log-date').addEventListener('change',event=>{
      const value=event.target.value;
      if(value>TODAY){event.target.value=TODAY;toast('Future check-ins are not supported.');return}
      state.selectedDate=value;loadLogForm(value);
    });
    $('daily-form').addEventListener('submit',saveDaily);
    $('record-start').addEventListener('click',recordStart);
    $('record-end').addEventListener('click',recordEnd);
    $('history-search').addEventListener('input',event=>{state.historySearch=event.target.value;renderHistory()});
    $('edit-period-form').addEventListener('submit',savePeriodEdit);
    $('cancel-edit-period').addEventListener('click',()=>$('edit-period-dialog').close());
  }
  function initialize(){
    if(!F){console.error('forecast.js failed to load');return}
    try{setTheme(localStorage.getItem('ifah-theme')==='dark'?'dark':'light')}catch(_){setTheme('light')}
    ['log-date','period-action-date','edit-period-start','edit-period-end'].forEach(id=>$(id).max=TODAY);
    $('log-date').value=TODAY;$('period-action-date').value=TODAY;
    if(DEMO){$('demo-banner').hidden=false;}
    else if(window.supabase?.createClient && window.IFAH_CONFIG){
      db=window.supabase.createClient(window.IFAH_CONFIG.supabaseUrl,window.IFAH_CONFIG.supabaseAnonKey);
    }
    registerListeners();loadLogForm(TODAY);fetchData();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
