window.courses = []; 
window.activeCourseIndex = 0;
window.isDirty = false;
window.currentSortField = null; 
window.currentSortDirection = 1; // 1 = עולה, -1 = יורד

const defaultColors = ["#74b9ff", "#C4E538", "#a29bfe", "#fd79a8", "#fa983a", "#b2bec3", "#81ecec", "#cd6133"];

// --- 1. ניהול אחסון (LocalStorage) ---
function saveToLocalStorage() {
    localStorage.setItem('exam_tracker_data', JSON.stringify({
        courses: courses,
        activeCourseIndex: activeCourseIndex,
		defaultQCount: document.getElementById('qCountSelect').value
    }));
}

function loadFromLocalStorage() {
    const savedData = localStorage.getItem('exam_tracker_data');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            courses = parsed.courses || [];
            activeCourseIndex = parsed.activeCourseIndex || 0;
            
            // עדכון ה-select אם קיים ערך שמור
            if (parsed.defaultQCount) {
                document.getElementById('qCountSelect').value = parsed.defaultQCount;
            }
            return true;
        } catch (e) {
            console.error("שגיאה בטעינת נתונים מהדפדפן", e);
            return false;
        }
    }
    return false;
}

// --- 2. אתחול האפליקציה ---
function init() {
    if (!loadFromLocalStorage() || courses.length === 0) {
        courses = [];
        addNewCourse("קורס חדש");
    }

    renderTabs();
    renderAll();

    // קישור כפתורי תפריט עליון
    document.getElementById('addRowBtn').onclick = () => { markDirty(); addNewRow(); };
    document.getElementById('addTopicBtn').onclick = () => { markDirty(); addNewTopic(); };
    document.getElementById('addCourseBtn').onclick = () => { markDirty(); addNewCourse(); };
    document.getElementById('renameCourseBtn').onclick = () => renameCourse(activeCourseIndex);
    document.getElementById('downloadBtn').onclick = saveFileWithPicker;
    document.getElementById('uploadInput').onchange = loadJSON;
	document.getElementById('qCountSelect').onchange = () => {
		saveToLocalStorage();
		markDirty();
		renderAll();
	}
    
    document.getElementById('clearDataBtn').onclick = () => { 
        if(confirm("זה ימחק הכל מהדפדפן. האם להמשיך?")) { 
            localStorage.removeItem('exam_tracker_data');
            courses = []; 
            addNewCourse(); 
            isDirty = false; 
            renderTabs(); 
            renderAll(); 
        } 
    };

    // התראה לפני סגירה
    window.addEventListener('beforeunload', (e) => { 
        if (isDirty) { 
            e.preventDefault(); 
            e.returnValue = ''; 
        } 
    });
}

// --- 3. ניהול מצב וקורסים ---
function markDirty() { 
    isDirty = true; 
    saveToLocalStorage(); 
    // עדכון סטטיסטיקה בזמן אמת אם המודאל פתוח
    if (document.getElementById('statsModal')?.style.display === "block") {
        StatsManager.renderAll();
    }
}

function cur() { return courses[activeCourseIndex]; }

function addNewCourse(name = "קורס חדש") {
    courses.push({ name: name, exams: [], topics: [] });
    activeCourseIndex = courses.length - 1;
    markDirty();
    renderTabs();
    renderAll();
}

function renderTabs() {
    const tabsContainer = document.getElementById('courseTabs');
    tabsContainer.innerHTML = '';
    courses.forEach((course, idx) => {
        const tab = document.createElement('div');
        tab.className = `course-tab ${idx === activeCourseIndex ? 'active' : ''}`;
        tab.innerHTML = `<span>${escapeHTML(course.name)}</span><span class="tab-close" onclick="deleteCourse(event, ${idx})">×</span>`;
        tab.onclick = () => { 
            activeCourseIndex = idx; 
            saveToLocalStorage();
            renderTabs(); 
            renderAll(); 
        };
        tabsContainer.appendChild(tab);
    });
}

function renameCourse(idx) {
    const newName = prompt("שם קורס חדש:", courses[idx].name);
    if (newName && newName.trim()) {
        courses[idx].name = newName.trim();
        markDirty(); renderTabs(); renderAll();
    }
}

function deleteCourse(event, idx) {
    event.stopPropagation();
    if (courses.length === 1) return;
    if (confirm(`למחוק את ${courses[idx].name}?`)) {
        courses.splice(idx, 1);
        activeCourseIndex = 0;
        markDirty(); renderTabs(); renderAll();
    }
}

// --- 4. רינדור טבלה ראשית ---
function renderAll() {
    renderHeaders();
    renderTable();
    renderTopicsTable();
}

function getMaxQuestions() {
    const def = parseInt(document.getElementById('qCountSelect').value);
    const max = cur().exams.reduce((m, e) => Math.max(m, e.specificQCount || 0), 0);
    return Math.max(def, max);
}

function renderHeaders() {
    const total = getMaxQuestions();
	
	const sortTh = (label, field, qIdx = null) => {
        const id = qIdx !== null ? `score-${qIdx}` : field;
        let icon = "↕️";
        if (window.currentSortField === id) {
            icon = window.currentSortDirection === 1 ? "▲" : "▼";
        }
        return `<th onclick="sortTable('${field}', ${qIdx})" style="cursor:pointer; user-select:none;">${label} ${icon}</th>`;
    };
	
    let html = `<tr>
        <th>פעולות</th>
        ${sortTh('שנה', 'year')}
        ${sortTh("סמס'", 'semester')}
        ${sortTh('מועד', 'term')}
        ${sortTh('שאלות', 'specificQCount')}`;

    for(let i=0; i<total; i++) {
        html += sortTh(`ניקוד ${i+1}`, 'score', i);
    }

    html += `
        ${sortTh('ציון', 'finalGrade')}
        <th>תאריך</th>
        <th style="width:200px">הערות</th>
        <th>הודפס?</th>`;

    for(let i=1; i<=total; i++) html += `<th>נושא ${i}</th>`;
    for(let i=1; i<=total; i++) html += `<th style="width:200px">חזרה ${i}</th>`;
    html += `</tr>`;

    document.getElementById('examsHead').innerHTML = html;
}

function renderTable() {
    const total = getMaxQuestions();
    const tbody = document.getElementById('examsBody');
    tbody.innerHTML = '';

    cur().exams.forEach((exam, idx) => {
        const qCount = exam.specificQCount || 3;
        let html = `<td><button class="btn-row-delete" onclick="deleteExam(${idx})">מחק</button></td>
            <td><input type="number" value="${exam.year}" style="width:55px" onchange="markDirty(); cur().exams[${idx}].year=this.value; saveToLocalStorage();"></td>
            <td><input type="text" value="${escapeHTML(exam.semester)}" style="width:30px" onchange="markDirty(); cur().exams[${idx}].semester=this.value; saveToLocalStorage();"></td>
            <td><input type="text" value="${escapeHTML(exam.term)}" style="width:30px" onchange="markDirty(); cur().exams[${idx}].term=this.value; saveToLocalStorage();"></td>
            <td><input type="number" value="${qCount}" style="width:40px" onchange="markDirty(); cur().exams[${idx}].specificQCount=parseInt(this.value); renderAll(); saveToLocalStorage();"></td>`;

        for(let i=0; i<total; i++) {
            if(i < qCount) {
				const score = exam.scores[i] || 0;
				const tId = exam.topics[i];
				const tObj = cur().topics.find(t => String(t.id) === String(tId));
				
				// לוגיקת הצבעים התואמת לנושאים:
				let bg = "#ffffff"; // ברירת מחדל לניקוד 0
				
				if (score === -1) {
					bg = "#ff7675"; // אדום ל- -1
				} else if (score === 200) {
					bg = "#fdcb6e"; // צהוב ל- 200
				} else if (score > 0) {
					bg = "#2ecc71"; // ירוק לכל ציון אחר שגדול מ-0
				}
				
				// קביעת צבע הטקסט - אם הרקע צבעוני וכהה (כמו הירוק או האדום), נשתמש בטקסט לבן לחדות
				const textColor = (bg !== "#ffffff" && bg !== "#fdcb6e") ? "white" : "black";

				html += `<td style="background-color:${bg}; text-align: center;">
					<input type="number" value="${score}" 
						   style="width:45px; background: transparent; border: none; text-align: center; color: ${textColor}; font-weight: bold;" 
						   onchange="updateScore(${idx},${i},this.value)">
				</td>`;
			} else {
				html += `<td class="empty-cell">-</td>`;
			}
        }

        html += `<td><strong>${exam.finalGrade||0}</strong></td>
            <td><input type="date" value="${exam.date}" onchange="markDirty(); cur().exams[${idx}].date=this.value; saveToLocalStorage();"></td>
            <td><textarea class="notes-textarea" oninput="autoResize(this)" onchange="markDirty(); cur().exams[${idx}].notes=this.value; saveToLocalStorage();">${escapeHTML(exam.notes)}</textarea></td>
            <td><input type="checkbox" ${exam.printed?'checked':''} onchange="markDirty(); cur().exams[${idx}].printed=this.checked; saveToLocalStorage();"></td>`;

        for(let i=0; i<total; i++) {
            if(i < qCount) {
                const tId = exam.topics[i];
                const score = exam.scores[i] || 0;
                const tObj = cur().topics.find(t => String(t.id) === String(tId));
                let bg = tObj ? tObj.color : "#ffffff";
                if(score === -1) bg = "#ff7675"; else if(score > 0) bg = (score === 200) ? "#fdcb6e" : "#2ecc71";
                html += `<td style="background-color:${bg}"><select onchange="markDirty(); updateTopic(${idx},${i},this.value)">
                    <option value="">בחר</option>${cur().topics.map(t=>`<option value="${t.id}" ${t.id==tId?'selected':''}>${escapeHTML(t.name)}</option>`).join('')}
                </select></td>`;
            } else html += `<td class="empty-cell">-</td>`;
        }
        for(let i=0; i<total; i++) {
            if(i < qCount) html += `<td><textarea class="review-textarea" oninput="autoResize(this)" onchange="markDirty(); updateReview(${idx},${i},this.value); learnFromCorrection(${idx},${i},this.value)">${escapeHTML(exam.review?.[i]||'')}</textarea></td>`;
            else html += `<td class="empty-cell">-</td>`;
        }
        const tr = document.createElement('tr'); tr.innerHTML = html; tbody.appendChild(tr);
    });
}

// --- 5. לוגיקה של ציונים ונושאים ---
function updateScore(exIdx, qIdx, val) {
    let s = parseFloat(val);
    if(s !== 200) { if(s > 100) s = 100; else if(s < -1) s = -1; }
    cur().exams[exIdx].scores[qIdx] = s;

    if(!cur().exams[exIdx].date && (s > 0 || s === -1 || s === 200)) {
        cur().exams[exIdx].date = new Date().toISOString().split('T')[0];
    }

    const valid = cur().exams[exIdx].scores.slice(0, cur().exams[exIdx].specificQCount).map(v => (v===200||v===-1)?0:v);
    cur().exams[exIdx].finalGrade = valid.reduce((a,b)=>a+b, 0);
    
    markDirty();
    renderAll();
}

function updateTopic(exIdx, qIdx, val) { 
    cur().exams[exIdx].topics[qIdx] = val; 
    if (typeof learnFromCorrection === "function") {
        learnFromCorrection(exIdx, qIdx, val);
    }
    markDirty(); 
    renderAll(); 
}

function updateReview(exIdx, qIdx, val) { 
    if(!cur().exams[exIdx].review) cur().exams[exIdx].review = []; 
    cur().exams[exIdx].review[qIdx] = val; 
    markDirty(); 
}

function addNewRow() {
    const qc = parseInt(document.getElementById('qCountSelect').value);
    const targetYear = new Date().getFullYear() - 1;
    cur().exams.push({ 
        year: targetYear, semester: '', term: '', date: '', specificQCount: qc, 
        scores: Array(10).fill(0), topics: Array(10).fill(''), review: Array(10).fill(''), 
        finalGrade: 0, notes: '', printed: false 
    });
    renderAll();
}

function addNewTopic() {
    const color = cur().topics.length < 8 ? defaultColors[cur().topics.length] : "#ffffff";
    cur().topics.push({ id:Date.now(), name:'', color:color, learnedKeywords: [] });
    markDirty();
    renderTopicsTable();
}

function renderTopicsTable() {
    const tbody = document.getElementById('topicsBody'); tbody.innerHTML = '';
    const stats = {}; cur().topics.forEach(t => stats[t.id] = { total:0, solved:0, read:0 });
    
    cur().exams.forEach(ex => {
        for(let i=0; i<ex.specificQCount; i++) {
            const id = ex.topics[i];
            const score = ex.scores[i];
            if(id && stats[id] && score !== -1) {
                stats[id].total++;
                if(score > 0 && score < 200) stats[id].solved++;
                else if(score === 200) stats[id].read++;
            }
        }
    });

    cur().topics.forEach((t, i) => {
        const remaining = stats[t.id].total - stats[t.id].solved - stats[t.id].read;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input type="text" value="${escapeHTML(t.name)}" onchange="markDirty(); cur().topics[${i}].name=this.value; saveToLocalStorage(); renderAll();"></td>
            <td>${stats[t.id].total}</td><td>${stats[t.id].solved}</td><td>${stats[t.id].read}</td>
            <td style="color:${remaining > 0 ? '#dc3545' : '#28a745'}">${remaining}</td>
            <td><input type="color" value="${t.color}" onchange="markDirty(); cur().topics[${i}].color=this.value; renderAll();"></td>
            <td><button class="btn-row-delete" onclick="deleteTopic(${i})">מחק</button></td>`;
        tbody.appendChild(tr);
    });
}

function deleteExam(i) { if(confirm("למחוק?")) { cur().exams.splice(i,1); markDirty(); renderAll(); } }
function deleteTopic(i) { if(confirm("למחוק?")) { cur().topics.splice(i,1); markDirty(); renderAll(); } }

// --- 6. ייצוא וייבוא קבצים ---
async function saveFileWithPicker() {
    const content = JSON.stringify({ courses: courses }, null, 2);
    const fileName = `מעקב_מבחנים_${new Date().toLocaleDateString().replace(/\./g, '-')}.json`;

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            isDirty = false;
            alert("הקובץ נשמר בהצלחה!");
        } catch (err) { console.log("ביטול"); }
    } else {
        const blob = new Blob([content], { type: "application/json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        isDirty = false;
    }
}

function loadJSON(e) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            courses = d.courses || [];
            activeCourseIndex = 0;
            isDirty = false;
            saveToLocalStorage();
            renderTabs(); renderAll();
        } catch(err) { alert("שגיאה בטעינת הקובץ"); }
    };
    reader.readAsText(e.target.files[0]);
}

// --- 7. פונקציות עזר, מודאל והדפסה ---
function escapeHTML(str) { return str ? str.toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])) : ""; }

function openModal() { document.getElementById("infoModal").style.display = "block"; }
function closeModal() { document.getElementById("infoModal").style.display = "none"; }

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function printCourseSummary() {
    const course = cur();
    const printWindow = window.open('', '_blank');
    const maxQs = course.exams.reduce((max, ex) => Math.max(max, ex.specificQCount || 0), 0);
    
    let topicsHtml = `<h3>סיכום לפי נושאים</h3><table border="1" style="width:100%; border-collapse:collapse; margin-bottom:20px; text-align:center;">
        <thead><tr style="background:#f2f2f2;"><th>שם הנושא</th><th>סה"כ</th><th>פתורות</th><th>נקראו</th><th>נותרו</th></tr></thead><tbody>`;
    
    course.topics.forEach(t => {
        const stats = { total: 0, solved: 0, read: 0 };
        course.exams.forEach(ex => {
            for(let i=0; i<ex.specificQCount; i++) {
                if(String(ex.topics[i]) === String(t.id)) {
                    const s = ex.scores[i];
                    if(s !== -1) { stats.total++; if(s > 0 && s < 200) stats.solved++; else if(s === 200) stats.read++; }
                }
            }
        });
        const rem = stats.total - stats.solved - stats.read;
        topicsHtml += `<tr><td style="text-align:right; padding:5px;">${escapeHTML(t.name)}</td><td>${stats.total}</td><td>${stats.solved}</td><td>${stats.read}</td><td style="font-weight:bold; color:${rem>0?'red':'green'}">${rem}</td></tr>`;
    });
    topicsHtml += `</tbody></table>`;

    let examsHtml = `<h3>פירוט מבחנים</h3><table border="1" style="width:100%; border-collapse:collapse; font-size:11px; text-align:center;">
        <thead><tr style="background:#f2f2f2;"><th rowspan="2">מבחן</th><th colspan="${maxQs}">נושאים</th><th colspan="${maxQs}">חזרה</th><th rowspan="2">הערות</th></tr><tr style="background:#eee;">`;
    for(let i=1; i<=maxQs; i++) examsHtml += `<th>${i}</th>`;
    for(let i=1; i<=maxQs; i++) examsHtml += `<th>${i}</th>`;
    examsHtml += `</tr></thead><tbody>`;

    course.exams.forEach(ex => {
        const name = `${ex.year} | ${ex.semester||'-'} | ${ex.term||'-'}`;
        examsHtml += `<tr><td style="background:#fafafa;"><b>${escapeHTML(name)}</b></td>`;
        for(let i=0; i<maxQs; i++) {
            const t = course.topics.find(top => String(top.id) === String(ex.topics[i]));
            examsHtml += `<td>${i<ex.specificQCount ? escapeHTML(t?.name||'') : ''}</td>`;
        }
        for(let i=0; i<maxQs; i++) {
            examsHtml += `<td style="text-align:right;">${i<ex.specificQCount ? escapeHTML(ex.review?.[i]||'') : ''}</td>`;
        }
        examsHtml += `<td style="text-align:right;">${escapeHTML(ex.notes||'')}</td></tr>`;
    });
    examsHtml += `</tbody></table>`;

    printWindow.document.write(`
        <html dir="rtl"><head><title>הדפסה - ${course.name}</title><style>
            @page { size: landscape; margin: 1cm; }
            body { font-family: sans-serif; }
            table { table-layout: fixed; width: 100%; border-collapse: collapse; }
            td, th { border: 1px solid #000; padding: 4px; word-wrap: break-word; white-space: pre-line; }
        </style></head><body>
            <h1 style="text-align:center;">קורס: ${escapeHTML(course.name)}</h1>
            ${topicsHtml}${examsHtml}
            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); };</script>
        </body></html>`);
    printWindow.document.close();
}

async function handlePDFUpload(event) {
    if (!window.Classifier) return;
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('aiLoader');
    try {
        if (loader) loader.style.display = "block";

        const fullText = await window.Classifier.extractTextFromPDF(file);
        const questions = window.Classifier.splitTextIntoQuestions(fullText);
        const details = window.Classifier.extractExamDetails(fullText);

        addNewRow();
        const currentExam = cur().exams[cur().exams.length - 1];
        
        currentExam.fullQuestions = questions;
        currentExam.year = details.year || '';
        currentExam.semester = details.semester || '';
        currentExam.term = details.term || '';
        currentExam.specificQCount = questions.length;
        currentExam.topics = Array(questions.length).fill('');
        currentExam.scores = Array(questions.length).fill(0);
        currentExam.review = Array(questions.length).fill('');

        const topics = cur().topics;

        for (let i = 0; i < questions.length; i++) {
            const result = await window.Classifier.classifyText(questions[i], topics); 
            const topicObj = topics.find(t => t.name === result.topic);
            if (topicObj) currentExam.topics[i] = topicObj.id;
        }

        if (loader) loader.style.display = "none";
        markDirty();
        renderAll();

    } catch (e) {
        console.error(e);
        if (loader) loader.style.display = "none";
    }
}

async function learnFromCorrection(examIdx, questionIdx, newTopicId) {
    if (!newTopicId) return;
    
    const exam = cur().exams[examIdx];
    const questionText = (exam.fullQuestions && exam.fullQuestions[questionIdx]) ? exam.fullQuestions[questionIdx] : "";
    if (!questionText) return;

    const topic = cur().topics.find(t => String(t.id) === String(newTopicId));
    if (!topic) return;

    if (!topic.learnedKeywords) topic.learnedKeywords = [];

    const words = questionText.toLowerCase()
        .replace(/[^א-ת\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 6 && !["הוכח", "מצא", "נתון", "חשב", "הפונקציה"].includes(w));

    const newWords = words.sort((a, b) => b.length - a.length).slice(0, 3);

    newWords.forEach(w => {
        if (!topic.learnedKeywords.includes(w)) {
            topic.learnedKeywords.push(w);
        }
    });

    console.log(`🎯 המערכת למדה עבור ${topic.name}:`, topic.learnedKeywords);
    markDirty();
}

function sortTable(field, qIdx = null) {
    const id = qIdx !== null ? `score-${qIdx}` : field;
    
    // שינוי כיוון אם לחצנו על אותה עמודה
    if (window.currentSortField === id) {
        window.currentSortDirection *= -1;
    } else {
        window.currentSortField = id;
        window.currentSortDirection = 1;
    }

    cur().exams.sort((a, b) => {
        let valA, valB;

        if (field === 'score') {
            valA = a.scores[qIdx] !== undefined ? a.scores[qIdx] : -Infinity;
            valB = b.scores[qIdx] !== undefined ? b.scores[qIdx] : -Infinity;
        } else {
            valA = a[field];
            valB = b[field];
        }

        // טיפול בערכים ריקים
        if (valA === undefined || valA === null || valA === '') valA = (typeof valB === 'number') ? -Infinity : '';
        if (valB === undefined || valB === null || valB === '') valB = (typeof valA === 'number') ? -Infinity : '';

        // השוואה לפי סוג (מספרים מול טקסט)
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * window.currentSortDirection;
        }
        
        return String(valA).localeCompare(String(valB), 'he') * window.currentSortDirection;
    });

    renderAll(); // רינדור מחדש של הכל
}

window.onload = init;