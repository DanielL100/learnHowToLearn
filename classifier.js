// הגדרת משתנה גלובלי למודל
let embedder = null;

// פונקציית אתחול המודל
async function initClassifier() {
    if (!embedder) {
        const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');
        embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
    }
}

// 1. חילוץ טקסט - מוגדרת בצורה מפורשת
async function extractTextFromPDF(file) {
    console.log("--- מחלץ טקסט מ-PDF ---");
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // סינון פוטרים (גובה > 70)
        const filteredItems = content.items.filter(item => item.transform[5] > 70);
        fullText += filteredItems.map(item => item.str).join(" ") + "\n";
    }
    return fullText;
}

// 2. חיתוך שאלות עם הגנה מפני דפי שער
function splitTextIntoQuestions(text) {
    let cleanText = text.replace(/\s+/g, ' ').trim();
    const questionPattern = /(שאלה\s+\d+[:\-\.]?|Question\s+\d+[:\-\.]?)/g;
    let parts = cleanText.split(questionPattern);
    let questions = [];

    for (let i = 1; i < parts.length; i += 2) {
        let title = parts[i];
        let body = parts[i + 1] || "";
        let fullQuestion = (title + " " + body).trim();

        // סינון דפי שער: אם השאלה קצרה מדי או מכילה מילות מנהלה - דלג
        const isManagement = /משך הבחינה|חומר עזר|מרצה|מתרגל|הוראות לנבחן|ציון|מספר זהות/i.test(fullQuestion);
        if (fullQuestion.length > 60 && !isManagement) {
            questions.push(fullQuestion);
        }
    }
    return questions;
}

// 3. סיווג עם חישוב ביטחון משופר
async function classifyText(text, topics) {
    await initClassifier();
    
    // ניקוי טקסט (הסרת משתנים בודדים באנגלית)
    let cleanText = text.toLowerCase()
        .replace(/\b[a-z]\b/g, ' ') 
        .replace(/[^א-ת0-9\s]/g, ' ')
        .replace(/\s+/g, ' ');

    let scoresLog = [];
    const queryVector = await embedder(cleanText, { pooling: 'mean', normalize: true });

    for (let topicObj of topics) {
        const topicName = topicObj.name.toLowerCase();
        
        // א. דמיון סמנטי (AI)
        const topicVector = await embedder(topicName, { pooling: 'mean', normalize: true });
        let semanticScore = 0;
        for(let i=0; i<queryVector.data.length; i++) {
            semanticScore += queryVector.data[i] * topicVector.data[i];
        }

        // ב. בונוס מילים מפורשות (משקל כבד לדיוק חוצה קורסים)
        let wordMatchScore = 0;
        const topicWords = topicName.split(/\s+/).filter(w => w.length > 3);
        topicWords.forEach(word => {
            if (cleanText.includes(word.substring(0, word.length - 1))) {
                wordMatchScore += 60.0; 
            }
        });

        // ג. בונוס למידה מתיקונים ידניים
        let learningScore = 0;
        if (topicObj.learnedKeywords) {
            topicObj.learnedKeywords.forEach(kw => {
                if (cleanText.includes(kw.toLowerCase())) learningScore += 45.0;
            });
        }

        let finalScore = (semanticScore * 12) + wordMatchScore + learningScore;
        scoresLog.push({ name: topicObj.name, score: finalScore });
    }

    // מיון לפי ציון
    scoresLog.sort((a, b) => b.score - a.score);
    const best = scoresLog[0];
    const second = scoresLog[1] || { score: 0 };

    // חישוב ביטחון: כמה הראשון רחוק מהשני
    let confidence = 0;
    if (best.score > 0) {
        const gap = best.score - second.score;
        // ביטחון בסיסי + בונוס על פער
        confidence = Math.min(100, Math.round((gap / best.score) * 100) + 50);
    }

    console.log(`🔍 ניתוח שאלה (אורך: ${text.length} תווים)`);
    console.log(`🎯 סיווג: ${best.name} | ביטחון: ${confidence}%`);
    
    return { topic: best.name, confidence };
}

// 4. חילוץ פרטים
function extractExamDetails(text) {
    const details = { year: '', semester: '', term: '' };
    const yearMatch = text.match(/תש[א-ת]\"[א-ת]|20\d{2}/);
    if (yearMatch) details.year = yearMatch[0];
    const termMatch = text.match(/מועד\s+([א-ב]|מיוחד)/);
    if (termMatch) details.term = termMatch[1] || termMatch[0].replace('מועד', '').trim();
    if (text.includes("סמסטר א") || text.includes("חורף")) details.semester = "א";
    else if (text.includes("סמסטר ב") || text.includes("אביב")) details.semester = "ב";
    return details;
}

// ייצוא אובייקט אחד מסודר
window.Classifier = { 
    extractTextFromPDF, 
    splitTextIntoQuestions, 
    classifyText, 
    extractExamDetails 
};