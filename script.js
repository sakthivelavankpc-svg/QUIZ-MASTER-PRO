// 1. IMPORT FIREBASE MODULES
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, updateDoc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAnxIsftWdUxtHEh7nxX1UPRA29c0n1444",
    authDomain: "quiz-master-3e489.firebaseapp.com",
    projectId: "quiz-master-3e489",
    storageBucket: "quiz-master-3e489.firebasestorage.app",
    messagingSenderId: "741393992507",
    appId: "1:741393992507:web:b28cd8fcda2b74f85b851e"
};

// 3. INITIALIZATION
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 4. GLOBAL STATE & UTILITIES
const $ = (id) => document.getElementById(id);
let globalQuizzes = [];
let currentQuizData = null;
let currentQuestions = [];
let studentAnswers = {};
let currentQIndex = 0;
let mainTimerInterval = null;
let mainSecondsLeft = 0;
let currentUser = null; 

// 5. REGISTRATION & LOGIN SYSTEM
async function handleLogin() {
    const identifier = $('loginIdentifier').value.trim();
    if (!identifier) return alert("Enter Phone Number or User ID");
    
    const storedUser = await localforage.getItem(`user_${identifier}`);
    if (storedUser) {
        currentUser = storedUser;
        completeAuthSequence();
    } else {
        alert("User not found. Please register.");
    }
}

async function handleRegistration() {
    const name = $('regName').value.trim();
    const phone = $('regPhone').value.trim();
    if (!name || !phone) return alert("Name and Phone are mandatory.");
    
    const userId = "QM" + Math.floor(Math.random() * 90000 + 10000);
    currentUser = {
        userId, name, phone, 
        email: $('regEmail').value.trim(),
        school: $('regSchool').value.trim(),
        city: $('regCity').value.trim(),
        role: $('regRole').value,
        history: [], bookmarks: []
    };
    
    await localforage.setItem(`user_${phone}`, currentUser);
    await localforage.setItem(`user_${userId}`, currentUser);
    
    alert(`Registration Successful! Your User ID is: ${userId}.`);
    completeAuthSequence();
}

function completeAuthSequence() {
    $('studentLoginModal').classList.add('hidden');
    $('dashboardToggleBtn').classList.remove('hidden');
    $('dispName').textContent = currentUser.name;
    $('dispPlace').textContent = currentUser.city || currentUser.school;
    $('studentInfoDisplay').classList.remove('hidden');
    
    if (currentQuizData) resumeOrStartQuiz();
}

// 6. SPREADSHEET (CSV/XLSX) UPLOAD & PARSING
$('csvFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
        const dataBuffer = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(dataBuffer, { type: 'array' });
        
        // Grab the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert sheet to JSON array
        // Expects columns: Question, Option A, Option B, Option C, Option D, Answer
        const rawJsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        if (rawJsonData.length === 0) {
            alert("The uploaded spreadsheet appears to be empty.");
            return;
        }

        const parsedQuestions = rawJsonData.map((row) => {
            return {
                text: row.Question || row.question || "Untitled Question",
                options: [
                    row['Option A'] || row.optionA || row.option_a, 
                    row['Option B'] || row.optionB || row.option_b, 
                    row['Option C'] || row.optionC || row.option_c, 
                    row['Option D'] || row.optionD || row.option_d
                ].filter(Boolean),
                answer: row.Answer || row['Correct Answer'] || row.answer || ""
            };
        });

        currentQuizData = {
            id: "EXCEL_IMPORT_" + Date.now(),
            metaSubject: "Imported Subject",
            metaTopic: firstSheetName,
            metaExam: "Custom Import",
            totalMinutes: 30, // Default 30 mins
            shuffleQuestions: false,
            questions: parsedQuestions
        };

        alert(`Successfully imported ${parsedQuestions.length} questions from ${file.name}! Starting preview...`);
        $('creatorPanel').classList.add('hidden');
        resumeOrStartQuiz();
    };
    reader.readAsArrayBuffer(file);
});

// 7. QUIZ RESUME & EXECUTION
async function resumeOrStartQuiz() {
    $('quizSection').classList.remove('hidden');
    
    // Check for cached resume state
    const savedState = await localforage.getItem(`resume_${currentUser?.userId}_${currentQuizData.id}`);
    
    if (savedState) {
        currentQuestions = savedState.questions;
        studentAnswers = savedState.answers;
        currentQIndex = savedState.currentIndex;
        mainSecondsLeft = savedState.timeLeft;
    } else {
        currentQuestions = currentQuizData.shuffleQuestions ? shuffleArray([...currentQuizData.questions]) : [...currentQuizData.questions];
        studentAnswers = {};
        currentQIndex = 0;
        mainSecondsLeft = currentQuizData.totalMinutes * 60;
    }

    startTimers();
    renderQuestion();
}

function renderQuestion() {
    const data = currentQuestions[currentQIndex];
    if (!data) return;
    
    $('activeSubject').textContent = currentQuizData.metaSubject || "General";
    $('activeTopic').textContent = currentQuizData.metaTopic || "Mixed Topics";
    $('activeSource').textContent = currentQuizData.metaExam || "";

    $('questionProgressLabel').textContent = `Question ${currentQIndex + 1} of ${currentQuestions.length}`;
    $('questionBox').innerHTML = data.text; 
    
    const box = $('optionsBox');
    box.innerHTML = "";
    data.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = "opt-btn";
        btn.innerHTML = `<b>${String.fromCharCode(65 + idx)}.</b> ${opt}`;
        if (studentAnswers[currentQIndex] === opt) btn.style.background = "var(--secondary)";
        
        btn.onclick = () => {
            studentAnswers[currentQIndex] = opt;
            saveStateLocally(); 
            renderQuestion();
        };
        box.appendChild(btn);
    });
}

function saveStateLocally() {
    if(!currentUser || !currentQuizData) return;
    localforage.setItem(`resume_${currentUser.userId}_${currentQuizData.id}`, {
        questions: currentQuestions,
        answers: studentAnswers,
        currentIndex: currentQIndex,
        timeLeft: mainSecondsLeft
    });
}

// 8. HIGH QUALITY PDF EXPORT
$('printPdfBtn')?.addEventListener('click', () => {
    window.print();
});

// INITIALIZATION & EVENT LISTENERS
window.onload = () => {
    if($('tabLogin')) $('tabLogin').onclick = () => { $('loginForm').classList.remove('hidden'); $('registerForm').classList.add('hidden'); };
    if($('tabRegister')) $('tabRegister').onclick = () => { $('registerForm').classList.remove('hidden'); $('loginForm').classList.add('hidden'); };
    if($('loginBtn')) $('loginBtn').onclick = handleLogin;
    if($('registerBtn')) $('registerBtn').onclick = handleRegistration;
    if($('toggleSidebarBtn')) $('toggleSidebarBtn').onclick = () => $('youtubeSidebar').classList.toggle('collapsed');
    if($('dashboardToggleBtn')) $('dashboardToggleBtn').onclick = () => $('userDashboardModal').classList.remove('hidden');
    if($('closeDashboardBtn')) $('closeDashboardBtn').onclick = () => $('userDashboardModal').classList.add('hidden');
    
    // Setup Nav Buttons
    if($('prevBtn')) $('prevBtn').onclick = () => { if(currentQIndex > 0) { currentQIndex--; renderQuestion(); }};
    if($('nextBtn')) $('nextBtn').onclick = () => { if(currentQIndex < currentQuestions.length -1) { currentQIndex++; renderQuestion(); }};
};

function shuffleArray(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function startTimers() {
    clearInterval(mainTimerInterval);
    mainTimerInterval = setInterval(() => {
        mainSecondsLeft--;
        if ($('mainTimerLabel')) {
            $('mainTimerLabel').textContent = `${Math.floor(mainSecondsLeft / 60).toString().padStart(2, '0')}:${(mainSecondsLeft % 60).toString().padStart(2, '0')}`;
        }
    }, 1000);
}