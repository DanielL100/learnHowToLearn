// stats.js - מופרד לחלוטין ומהיר

// משתנים פנימיים (לא נגישים מחוץ לקובץ הזה)
let myLineChart = null;
let myPieChart = null;

window.StatsManager = {
    // פתיחת המודאל
    openModal: function() {
        const modal = document.getElementById("statsModal");
        if (!modal) return;

        modal.style.display = "block";
        
        // מהירות: אנחנו מחכים רק שהדפדפן יסיים את ה-Frame הנוכחי
        requestAnimationFrame(() => {
            this.renderAll();
        });
    },

    closeModal: function() {
        const modal = document.getElementById("statsModal");
        if (modal) modal.style.display = "none";
    },

    renderAll: function() {
        // גישה בטוחה לנתונים מהקובץ הראשי
        const courses = window.courses;
        const index = window.activeCourseIndex;

        if (!courses || courses[index] === undefined) {
            console.error("Stats Error: Courses not found");
            return;
        }

        const currentCourse = courses[index];

        // הרצה מהירה של כל הרכיבים
        this.updateLineChart(currentCourse);
        this.updatePieChart(currentCourse);
        this.renderSummary(currentCourse);
    },

    updateLineChart: function(course) {
        const ctx = document.getElementById('scoresChart')?.getContext('2d');
        if (!ctx) return;

        if (myLineChart) myLineChart.destroy();

        const validExams = (course.exams || [])
            .filter(e => e.date && e.finalGrade > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (validExams.length === 0) {
            this.drawEmptyState(ctx, "הזן תאריך וציון בטבלה");
            return;
        }

        myLineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: validExams.map(x => {
                    const d = new Date(x.date);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                }),
                datasets: [{
                    label: 'ציון',
                    data: validExams.map(x => x.finalGrade),
                    borderColor: '#6c5ce7',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 }, // אנימציה מהירה יותר (ברירת המחדל היא 1000)
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    },

    updatePieChart: function(course) {
		const ctx = document.getElementById('topicsPieChart')?.getContext('2d');
		if (!ctx) return;

		if (myPieChart) myPieChart.destroy();

		const topicCounts = {};
		(course.exams || []).forEach(ex => {
			(ex.topics || []).forEach((tId, i) => {
				if (tId && i < (ex.specificQCount || 0)) {
					topicCounts[tId] = (topicCounts[tId] || 0) + 1;
				}
			});
		});

		const labels = [], data = [], colors = [];
		Object.keys(topicCounts).forEach(id => {
			const topic = (course.topics || []).find(t => String(t.id) === String(id));
			if (topic) {
				labels.push(topic.name);
				data.push(topicCounts[id]);
				colors.push(topic.color || '#dfe6e9');
			}
		});

		if (data.length === 0) {
			this.drawEmptyState(ctx, "בחר נושאים בטבלה");
			return;
		}

		myPieChart = new Chart(ctx, {
			type: 'doughnut',
			data: {
				labels: labels,
				datasets: [{ 
					data: data, 
					backgroundColor: colors,
					borderWidth: 1 
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				layout: {
					padding: { top: 10, bottom: 10, left: 5, right: 5 }
				},
				plugins: {
					legend: {
						position: 'right', // העברה לצד ימין - חוסך המון מקום לגובה
						rtl: true,
						labels: {
							boxWidth: 10,
							font: { size: 10 },
							padding: 10,
							usePointStyle: true // הופך את הריבועים לעיגולים קטנים ואסתטיים
						}
					},
					tooltip: {
						rtl: true
					}
				}
			}
		});
	},

    // stats.js - הוספת דירוג נושאים חזקים

	renderSummary: function(course) {
		const summaryElem = document.getElementById('statsSummary');
		if (!summaryElem) return;

		// 1. חישוב ממוצע כללי ומספר מבחנים
		const examsWithGrades = (course.exams || []).filter(e => e.finalGrade > 0);
		const avg = examsWithGrades.length 
			? (examsWithGrades.reduce((a, b) => a + b.finalGrade, 0) / examsWithGrades.length).toFixed(1) 
			: "0.0";

		// 2. חישוב ממוצע לכל נושא בנפרד
		let topicStats = {};
		course.exams.forEach(ex => {
			(ex.scores || []).forEach((score, i) => {
				const tId = ex.topics[i];
				// מחשיבים רק ציונים תקינים (לא ציוני "נקרא" או "לא נפתר")
				if (tId && score > 0 && score <= 100) {
					if (!topicStats[tId]) topicStats[tId] = { sum: 0, count: 0 };
					topicStats[tId].sum += score;
					topicStats[tId].count++;
				}
			});
		});

		// 3. יצירת רשימה ממוינת של נושאים לפי ממוצע
		const sortedTopics = Object.keys(topicStats)
			.map(id => {
				const tObj = course.topics.find(t => String(t.id) === String(id));
				return {
					name: tObj ? tObj.name : "כללי",
					avg: (topicStats[id].sum / topicStats[id].count).toFixed(1),
					color: tObj ? tObj.color : "#636e72"
				};
			})
			.sort((a, b) => b.avg - a.avg); // מיון מהגבוה לנמוך

		// 4. בניית ה-HTML של כרטיסיות הממוצע והדירוג
		let topicsListHtml = sortedTopics.length > 0 
			? sortedTopics.map((t, i) => `
				<div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
					<span>${i + 1}. <b style="color:${t.color}">${t.name}</b></span>
					<span style="font-weight: bold;">${t.avg}</span>
				</div>
			`).join('')
			: "<p style='color:#b2bec3'>אין מספיק נתונים לדירוג</p>";

		summaryElem.innerHTML = `
			<div style="display: flex; gap: 20px; width: 100%; justify-content: center; flex-wrap: wrap;">
				<div class="stat-card" style="border-top: 5px solid #6c5ce7; flex: 1;">
					<div class="stat-label">ממוצע קורס</div>
					<div class="stat-value" style="color: #6c5ce7;">${avg}</div>
					<div style="font-size: 0.8em; color: #636e72; margin-top:5px;">${examsWithGrades.length} מבחנים</div>
				</div>

				<div class="stat-card" style="border-top: 5px solid #2ecc71; flex: 2; text-align: right; min-width: 280px;">
					<div class="stat-label" style="text-align: center;">🏆 דירוג נושאים (לפי חוזק)</div>
					<div style="margin-top: 10px; max-height: 150px; overflow-y: auto; padding-left: 5px;">
						${topicsListHtml}
					</div>
				</div>
			</div>
		`;
	},

    drawEmptyState: function(ctx, text) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "14px Assistant, sans-serif";
        ctx.fillStyle = "#b2bec3";
        ctx.textAlign = "center";
        ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height / 2);
    }
};