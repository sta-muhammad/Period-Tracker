const SUPABASE_URL = "https://wfupmihrudgpegzykfao.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXBtaWhydWRncGVnenlrZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Nzc1ODIsImV4cCI6MjEwMTE1MzU4Mn0.JTwOdPoL68DpXCJZyKiIjJvCj1auIe80NtVuSNITgD8";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("period-form");
const actionTypeSelect = document.getElementById("action-type");
const singleDateInput = document.getElementById("single-date");
const dateLabel = document.getElementById("date-label");

const historyList = document.getElementById("history-list");
const submitBtn = document.getElementById("submit-btn");

const currentPhaseEl = document.getElementById("current-phase");
const currentDayEl = document.getElementById("current-day");
const nextPeriodDateEl = document.getElementById("next-period-date");
const nextPeriodCountdownEl = document.getElementById("next-period-countdown");
const ovulationWindowEl = document.getElementById("ovulation-window");
const tipsCard = document.getElementById("tips-card");
const phaseTipsContent = document.getElementById("phase-tips-content");
const symptomsInput = document.getElementById("symptoms-input");
const svgPhaseSegmentsEl = document.getElementById("svg-phase-segments");

let globalPeriodsCache = [];
let globalDailyLogsCache = [];
let calendarCurrentDate = new Date();

let selectedAction = "daily";
let selectedFlow = "";
let selectedSeverity = "Mild / None";
let selectedMood = "Calm & Balanced";

document.addEventListener("DOMContentLoaded", () => {
    if (singleDateInput) {
        singleDateInput.value = new Date().toISOString().split('T')[0];
    }

    fetchAndRenderData();
    setupChipListeners();

    if (actionTypeSelect) {
        actionTypeSelect.addEventListener("change", (e) => {
            selectedAction = e.target.value;
            updateFormLabels();
        });
    }

    document.getElementById("prev-month").addEventListener("click", () => {
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
        renderCalendar(globalPeriodsCache);
    });

    document.getElementById("next-month").addEventListener("click", () => {
        calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
        renderCalendar(globalPeriodsCache);
    });
});

function setupChipListeners() {
    setupGroup("flow-chips", (val) => { selectedFlow = val; });
    setupGroup("severity-chips", (val) => { selectedSeverity = val; });
    setupGroup("mood-chips", (val) => { selectedMood = val; });
}

function setupGroup(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
            chip.classList.add("selected");
            callback(chip.getAttribute("data-value"));
        });
    });
}

window.switchView = function(viewName, btnElement) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    document.getElementById(`view-${viewName}`).classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    if (viewName === 'calendar') {
        renderCalendar(globalPeriodsCache);
    }
};

function updateFormLabels() {
    if (selectedAction === "start") {
        dateLabel.textContent = "Period Start Date";
    } else if (selectedAction === "end") {
        dateLabel.textContent = "Period End Date";
    } else {
        dateLabel.textContent = "Daily Check-in Date";
    }
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedDate = singleDateInput.value;

    if (!selectedDate) {
        alert("Please select a valid date.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
        const symptomsVal = symptomsInput ? symptomsInput.value : null;

        if (selectedAction === "start") {
            const { error: periodError } = await db
                .from('periods')
                .insert([{ start_date: selectedDate, end_date: null }]);
            if (periodError) throw periodError;

            await upsertDailyLog(selectedDate, selectedFlow, selectedSeverity, selectedMood, symptomsVal);
        } 
        else if (selectedAction === "end") {
            const latestOpen = globalPeriodsCache.find(p => !p.end_date);
            if (!latestOpen) {
                alert("No active period found without an end date. Please log a 'Start Date' first!");
            } else {
                const { error } = await db
                    .from('periods')
                    .update({ end_date: selectedDate })
                    .eq('id', latestOpen.id);
                if (error) throw error;
            }
        } 
        else {
            await upsertDailyLog(selectedDate, selectedFlow, selectedSeverity, selectedMood, symptomsVal);
        }

        form.reset();
        singleDateInput.value = new Date().toISOString().split('T')[0];
        if (symptomsInput) symptomsInput.value = "";
        await fetchAndRenderData();
    } catch (err) {
        alert("Error saving entry: " + (err.message || err));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Entry";
    }
});

async function upsertDailyLog(dateStr, flow, severity, mood, symptoms) {
    const { error } = await db
        .from('daily_logs')
        .upsert([{ 
            log_date: dateStr, 
            flow: flow || null, 
            severity: severity || null, 
            mood: mood || null, 
            symptoms: symptoms || null 
        }], { onConflict: 'log_date' });

    if (error) throw error;
}

async function fetchAndRenderData() {
    try {
        const [periodsRes, logsRes] = await Promise.all([
            db.from('periods').select('*').order('start_date', { ascending: false }),
            db.from('daily_logs').select('*').order('log_date', { ascending: false })
        ]);

        if (periodsRes.error) throw periodsRes.error;
        if (logsRes.error) throw logsRes.error;

        globalPeriodsCache = periodsRes.data || [];
        globalDailyLogsCache = logsRes.data || [];
        
        renderUI(globalPeriodsCache, globalDailyLogsCache);
        renderCalendar(globalPeriodsCache);
    } catch (err) {
        historyList.innerHTML = `<li class="empty-state" style="color:red; text-align:center;">Failed to load data: ${err.message || err}</li>`;
        currentPhaseEl.textContent = "Error";
    }
}

window.deletePeriod = async function(id) {
    if (!confirm("Delete this period cycle?")) return;
    const { error } = await db.from('periods').delete().eq('id', id);
    if (error) alert("Error deleting: " + error.message);
    else fetchAndRenderData();
}

window.deleteLog = async function(id) {
    if (!confirm("Delete this daily log?")) return;
    const { error } = await db.from('daily_logs').delete().eq('id', id);
    if (error) alert("Error deleting: " + error.message);
    else fetchAndRenderData();
}

function calculateAdaptiveCycleLength(periods) {
    if (!periods || periods.length < 2) return 28;
    let cycleDiffs = [];
    for (let i = 0; i < periods.length - 1; i++) {
        if (!periods[i].start_date || !periods[i+1].start_date) continue;
        const currentStart = new Date(periods[i].start_date);
        const previousStart = new Date(periods[i+1].start_date);
        const diffDays = Math.round(Math.abs(currentStart - previousStart) / (1000 * 60 * 60 * 24));
        if (diffDays >= 21 && diffDays <= 45) cycleDiffs.push(diffDays);
    }
    if (cycleDiffs.length === 0) return 28;
    return Math.round(cycleDiffs.reduce((a, b) => a + b, 0) / cycleDiffs.length);
}

function formatDateString(dateStr) {
    if (!dateStr) return "Ongoing 🔄";
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
    if (!dateStr) return "Ongoing 🔄";
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderUI(periods, logs) {
    historyList.innerHTML = "";
    
    if ((!periods || periods.length === 0) && (!logs || logs.length === 0)) {
        historyList.innerHTML = `<li class="empty-state" style="text-align:center; padding:20px; color:#64748b;">No cycle data found.</li>`;
        currentPhaseEl.textContent = "No Data";
        currentDayEl.textContent = "-";
        nextPeriodDateEl.textContent = "-";
        nextPeriodCountdownEl.textContent = "-";
        ovulationWindowEl.textContent = "-";
        if (tipsCard) tipsCard.style.display = "none";
        return;
    }

    periods.forEach((p) => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.innerHTML = `
            <div class="history-details">
                <span>🩸 <strong>Period:</strong> ${formatFullDate(p.start_date)} &rarr; ${formatFullDate(p.end_date)}</span>
            </div>
            <button class="delete-btn" onclick="deletePeriod('${p.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    logs.forEach((l) => {
        const li = document.createElement("li");
        li.className = "history-item";
        let tagsHtml = `<span class="tag">📅 ${formatFullDate(l.log_date)}</span>`;
        if (l.flow) tagsHtml += `<span class="tag">Flow: ${l.flow}</span>`;
        if (l.severity && l.severity !== 'Mild / None') tagsHtml += `<span class="tag">Cramps: ${l.severity}</span>`;
        if (l.mood) tagsHtml += `<span class="tag">Mood: ${l.mood}</span>`;
        if (l.symptoms) {
            l.symptoms.split(',').map(s => s.trim()).filter(s => s.length > 0).forEach(s => {
                tagsHtml += `<span class="tag">${s}</span>`;
            });
        }
        li.innerHTML = `
            <div class="history-details"><div class="tags">${tagsHtml}</div></div>
            <button class="delete-btn" onclick="deleteLog('${l.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    if (!periods || periods.length === 0) return;

    const latestPeriod = periods[0];
    const avgCycleLength = calculateAdaptiveCycleLength(periods);
    const lastStart = new Date(latestPeriod.start_date);
    const lastEnd = latestPeriod.end_date ? new Date(latestPeriod.end_date) : null;

    // Indonesian time (WIB / UTC+7) adjustment
    const nowUtc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
    const idTime = new Date(nowUtc + (3600000 * 7)); 
    idTime.setHours(0, 0, 0, 0);

    const lastStartLocal = new Date(lastStart);
    lastStartLocal.setHours(0, 0, 0, 0);

    const diffTime = idTime - lastStartLocal;
    const currentDay = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

    let currentPhaseKey = "";
    let phaseTitleText = "";

    const bleedingDays = lastEnd ? Math.max(Math.floor((lastEnd - lastStart)/(1000*60*60*24)) + 1, 5) : 5;
    const estimatedOvulationDay = avgCycleLength - 14;

    if (currentDay < 1) {
        phaseTitleText = "Menstrual Phase";
        currentDayEl.textContent = "Day 1";
        currentPhaseKey = "menstrual";
    } else {
        currentDayEl.textContent = `Day ${currentDay}`;
        if (currentDay <= bleedingDays) {
            phaseTitleText = "Menstrual Phase";
            currentPhaseKey = "menstrual";
        } else if (currentDay < estimatedOvulationDay - 3) {
            phaseTitleText = "Follicular Phase";
            currentPhaseKey = "follicular";
        } else if (currentDay >= estimatedOvulationDay - 3 && currentDay <= estimatedOvulationDay + 1) {
            phaseTitleText = "Ovulation Window 🌸";
            currentPhaseKey = "ovulation";
        } else {
            phaseTitleText = "Luteal Phase";
            currentPhaseKey = "luteal";
        }
    }

    currentPhaseEl.textContent = phaseTitleText;

    renderPhaseClockSVG(currentDay, avgCycleLength, bleedingDays, estimatedOvulationDay);

    const nextPeriodDate = new Date(lastStart);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + avgCycleLength);
    
    const daysUntilNext = Math.round((nextPeriodDate - idTime) / (1000 * 60 * 60 * 24));
    nextPeriodDateEl.textContent = `${daysUntilNext} Days`;
    nextPeriodCountdownEl.textContent = formatDateString(nextPeriodDate);

    const ovulationDate = new Date(nextPeriodDate);
    ovulationDate.setDate(ovulationDate.getDate() - 14);
    const fertileStart = new Date(ovulationDate);
    fertileStart.setDate(ovulationDate.getDate() - 2);
    const fertileEnd = new Date(ovulationDate);
    fertileEnd.setDate(ovulationDate.getDate() + 2);

    ovulationWindowEl.textContent = `${formatDateString(fertileStart)} – ${formatDateString(fertileEnd)}`;

    const todayString = idTime.toISOString().split('T')[0];
    const todayLog = logs.find(l => l.log_date === todayString);
    renderDynamicTips(currentPhaseKey, todayLog);
}

function renderPhaseClockSVG(currentDay, totalDays, bleedingDays, ovulationDay) {
    if (!svgPhaseSegmentsEl) return;
    svgPhaseSegmentsEl.innerHTML = "";

    const radius = 95;
    const circumference = 2 * Math.PI * radius;
    
    const p1End = bleedingDays;                             
    const p2End = ovulationDay - 3;                         
    const p3End = ovulationDay + 1;                         
    const p4End = totalDays;                                

    const phases = [
        { start: 0, end: p1End, color: "#e11d48" },         
        { start: p1End, end: p2End, color: "#38bdf8" },     
        { start: p2End, end: p3End, color: "#ec4899" },     
        { start: p3End, end: p4End, color: "#8b5cf6" }      
    ];

    phases.forEach(p => {
        if (p.end <= p.start) return;
        const lengthFraction = (p.end - p.start) / totalDays;
        const offsetFraction = p.start / totalDays;

        const strokeLen = lengthFraction * circumference;
        const strokeDasharray = `${strokeLen} ${circumference - strokeLen}`;
        const strokeDashoffset = -offsetFraction * circumference;

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "110");
        circle.setAttribute("cy", "110");
        circle.setAttribute("r", radius);
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", p.color);
        circle.setAttribute("stroke-width", "12");
        circle.setAttribute("stroke-dasharray", strokeDasharray);
        circle.setAttribute("stroke-dashoffset", strokeDashoffset);
        circle.setAttribute("stroke-linecap", "round");
        svgPhaseSegmentsEl.appendChild(circle);
    });

    const safeDay = Math.min(Math.max(currentDay, 1), totalDays);
    const angleFraction = (safeDay - 0.5) / totalDays;
    const angle = angleFraction * 2 * Math.PI;
    const dotX = 110 + radius * Math.cos(angle);
    const dotY = 110 + radius * Math.sin(angle);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", dotX);
    dot.setAttribute("cy", dotY);
    dot.setAttribute("r", "8");
    dot.setAttribute("fill", "#ffffff");
    dot.setAttribute("stroke", "#e11d48");
    dot.setAttribute("stroke-width", "4");
    svgPhaseSegmentsEl.appendChild(dot);
}

function renderDynamicTips(phase, todayLog) {
    if (tipsCard) tipsCard.style.display = "block";
    let baseTips = {
        menstrual: "Drink plenty of warm water, enjoy cozy comfort foods, use a heating pad if needed, and get extra rest.",
        follicular: "Your energy is starting to bounce back! Great time to tackle new tasks, walk outside, and start fresh projects.",
        ovulation: "You are likely feeling your best and most social right now! Enjoy higher energy levels and great moods.",
        luteal: "Energy might slow down as your body prepares for the next cycle. Focus on comforting meals and gentle self-care routines."
    };

    let customTip = baseTips[phase] || "Keep tracking your daily updates!";
    if (todayLog) {
        if (todayLog.severity === "Severe" || todayLog.severity === "Moderate") {
            customTip += " Try magnesium-rich foods and herbal tea for cramp support.";
        }
        if (todayLog.flow === "Heavy") {
            customTip += " Remember to stay extra hydrated today.";
        }
    }
    if (phaseTipsContent) phaseTipsContent.textContent = customTip;
}

function renderCalendar(periods) {
    const gridEl = document.getElementById("calendar-grid");
    const monthYearEl = document.getElementById("cal-month-year");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearEl.textContent = `${monthNames[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const adjustedFirstDay = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < adjustedFirstDay; i++) {
        gridEl.appendChild(document.createElement("div"));
    }

    const nowUtc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
    const idTime = new Date(nowUtc + (3600000 * 7));
    const todayStr = idTime.toISOString().split('T')[0];

    const periodDaysSet = new Set();
    const fertileDaysSet = new Set();

    if (periods && periods.length > 0) {
        const avgCycleLength = calculateAdaptiveCycleLength(periods);
        periods.forEach(p => {
            if (!p.start_date) return;
            let start = new Date(p.start_date);
            let end = p.end_date ? new Date(p.end_date) : new Date(start);
            if (!p.end_date) end.setDate(end.getDate() + 4);

            let curr = new Date(start);
            while (curr <= end) {
                periodDaysSet.add(curr.toISOString().split('T')[0]);
                curr.setDate(curr.getDate() + 1);
            }

            let nextPer = new Date(start);
            nextPer.setDate(nextPer.getDate() + avgCycleLength);
            let ovDate = new Date(nextPer);
            ovDate.setDate(ovDate.getDate() - 14);
            let fStart = new Date(ovDate);
            fStart.setDate(ovDate.getDate() - 2);
            let fEnd = new Date(ovDate);
            fEnd.setDate(ovDate.getDate() + 2);

            let fCurr = new Date(fStart);
            while (fCurr <= fEnd) {
                fertileDaysSet.add(fCurr.toISOString().split('T')[0]);
                fCurr.setDate(fCurr.getDate() + 1);
            }
        });
    }

    for (let day = 1; day <= totalDays; day++) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "cal-day";
        dayDiv.textContent = day;
        const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (formattedDate === todayStr) dayDiv.classList.add("today");
        if (periodDaysSet.has(formattedDate)) dayDiv.classList.add("period");
        else if (fertileDaysSet.has(formattedDate)) dayDiv.classList.add("fertile");

        dayDiv.addEventListener("click", () => {
            if (singleDateInput) {
                singleDateInput.value = formattedDate;
                switchView('dashboard', document.querySelectorAll('.nav-item')[0]);
            }
        });
        gridEl.appendChild(dayDiv);
    }
}
