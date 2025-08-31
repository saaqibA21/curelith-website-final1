// script.js — frontend chat logic with per-user session + crisis flow support

const BASE_URL = 'https://d78739729426.ngrok-free.app/api';

// ──────────────────────────────────────────────────────────────────────────────
// Stable per-device session id (used by backend to isolate crisis sessions)
// ──────────────────────────────────────────────────────────────────────────────
let sid = localStorage.getItem('sid');
if (!sid) {
  sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replaceAll('-', '');
  localStorage.setItem('sid', sid);
}

// ──────────────────────────────────────────────────────────────────────────────
// DOM elements
// ──────────────────────────────────────────────────────────────────────────────
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');

// Diagnosis convo state (separate from chat/crisis)
let diagnosisSessionId = null;
let diagnosisStarted = false;

// ──────────────────────────────────────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────────────────────────────────────
function addMessage(text, sender = 'user') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.textContent = (sender === 'user' ? '🧍 ' : '🤖 ') + text;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return msgDiv;
}

function addCrisisOptions(crisisPayload) {
  if (!crisisPayload || !Array.isArray(crisisPayload.options)) return;

  const wrap = document.createElement('div');
  wrap.className = 'message ai';
  const label = document.createElement('div');
  label.textContent = 'Choose an option:';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '8px';
  row.style.marginTop = '6px';

  crisisPayload.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt.label || opt.id;
    btn.className = 'btn btn-small';
    btn.addEventListener('click', () => sendCrisisAction(opt.id));
    row.appendChild(btn);
  });

  wrap.appendChild(row);
  messagesContainer.appendChild(wrap);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setInputDisabled(disabled) {
  userInput.disabled = disabled;
}

// ──────────────────────────────────────────────────────────────────────────────
async function postJSON(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // send session id both ways (header + body) to match backend resolver
      'X-Session-Id': sid
    },
    credentials: 'include', // keep 'sid' cookie sticky across origins
    body: JSON.stringify({ ...body, session_id: body.session_id || sid })
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Non-JSON response:', raw);
    throw new Error(`HTTP ${res.status}`);
  }

  // backend may assign/echo a session_id—persist if new
  if (data.session_id && data.session_id !== sid) {
    sid = data.session_id;
    localStorage.setItem('sid', sid);
  }

  if (!res.ok) {
    const msg = data.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ──────────────────────────────────────────────────────────────────────────────
// Chat entry point
// ──────────────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';

  // Diagnose router
  if (text.toLowerCase().startsWith('diagnose ')) {
    const symptom = text.slice(9).trim();
    return startDiagnosis(symptom);
  } else if (diagnosisStarted) {
    return sendFollowupDiagnosis(text);
  }

  // Normal ask flow (with crisis support)
  setInputDisabled(true);
  const thinking = addMessage('…', 'ai');

  try {
    const data = await postJSON('/ask', { text, country: 'IN' });
    thinking.remove();

    // Always show assistant text
    if (data.answer) addMessage(data.answer, 'ai');

    // If crisis payload present, render options
    if (data.crisis) addCrisisOptions(data.crisis);

  } catch (err) {
    thinking.remove();
    addMessage('⚠️ No response received', 'ai');
    console.error(err);
  } finally {
    setInputDisabled(false);
    userInput.focus();
  }
}
window.sendMessage = sendMessage;

// ──────────────────────────────────────────────────────────────────────────────
// Crisis action sender (button clicks)
// ──────────────────────────────────────────────────────────────────────────────
async function sendCrisisAction(actionId) {
  setInputDisabled(true);
  const thinking = addMessage('…', 'ai');
  try {
    const data = await postJSON('/ask', { crisis_action: actionId });
    thinking.remove();

    if (data.answer) addMessage(data.answer, 'ai');
    if (data.crisis) addCrisisOptions(data.crisis);

  } catch (err) {
    thinking.remove();
    addMessage('⚠️ Couldn’t reach the server', 'ai');
    console.error(err);
  } finally {
    setInputDisabled(false);
    userInput.focus();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Diagnosis flows
// ──────────────────────────────────────────────────────────────────────────────
async function startDiagnosis(symptom) {
  diagnosisSessionId = crypto.randomUUID();
  diagnosisStarted = true;

  try {
    const data = await postJSON('/diagnose', { symptom, session_id: diagnosisSessionId });
    if (data.intro) addMessage(data.intro, 'ai');
    if (data.question) addMessage(data.question, 'ai');
    // if your diagnose endpoint also returns crisis, render it:
    if (data.crisis) addCrisisOptions(data.crisis);
  } catch (err) {
    addMessage('❌ Diagnosis failed: ' + err.message, 'ai');
    diagnosisStarted = false;
  }
}

async function sendFollowupDiagnosis(userInputText) {
  try {
    const data = await postJSON('/diagnose', {
      user_input: userInputText,
      session_id: diagnosisSessionId
    });

    if (data.question) {
      addMessage(data.question, 'ai');
    } else if (data.done) {
      // Your backend's final shape uses summaries/guidelines array;
      // show a compact message if present
      if (data.summaries && Array.isArray(data.summaries) && data.summaries.length) {
        const lines = data.summaries.map(s => `• ${s.symptom}: ${s.summary}`).join('\n');
        addMessage("🧠 Diagnosis Summary:\n" + lines, 'ai');
      } else if (data.summary) {
        addMessage("🧠 Diagnosis Summary: " + data.summary, 'ai');
      } else {
        addMessage("🧠 Diagnosis complete.", 'ai');
      }

      if (data.guidelines && Array.isArray(data.guidelines) && data.guidelines.length) {
        data.guidelines.forEach(g =>
          addMessage(`📘 Guideline for ${g.disease}:\n${g.plan}`, 'ai')
        );
      } else if (data.guideline) {
        addMessage(`📘 Guideline for ${data.guideline.disease}:\n${data.guideline.plan}`, 'ai');
      }

      diagnosisStarted = false;
    } else if (data.crisis) {
      // If crisis triggers mid-diagnosis
      addMessage(data.answer || 'Safety check', 'ai');
      addCrisisOptions(data.crisis);
    } else {
      addMessage("⚠️ Unexpected response.", 'ai');
    }
  } catch (err) {
    addMessage('❌ Error: ' + err.message, 'ai');
    diagnosisStarted = false;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Enter to send
// ──────────────────────────────────────────────────────────────────────────────
userInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Image Analyzer with preview + result (unchanged, but sends credentials too)
// ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const imageForm = document.getElementById('imageForm');
  const imageInput = document.getElementById('imageInput');
  const imageResult = document.getElementById('imageResult');
  const imagePreview = document.getElementById('imagePreview');

  if (imageForm) {
    imageForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const file = imageInput.files[0];
      if (!file) {
        imageResult.textContent = "❌ Please select an image.";
        return;
      }

      // Show preview
      const reader = new FileReader();
      reader.onload = () => {
        imagePreview.innerHTML = `<img src="${reader.result}" alt="Uploaded image" style="max-width:100%; border-radius:8px; margin-top:10px;" />`;
      };
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('file', file);

      imageResult.textContent = "⏳ Analyzing...";

      try {
        const res = await fetch(`${BASE_URL}/image-diagnose`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: { 'X-Session-Id': sid }
        });

        const raw = await res.text();
        let data;
        try { data = JSON.parse(raw); } catch {
          throw new Error('❌ Analysis failed');
        }
        imageResult.textContent = `🤖 ${data.result || "No diagnosis returned."}`;
      } catch (err) {
        imageResult.textContent = err.message;
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Disclaimer modal (show once per tab session)
// ──────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("disclaimerModal");
  const acceptBtn = document.getElementById("acceptDisclaimerBtn");

  if (modal && acceptBtn) {
    if (!sessionStorage.getItem("disclaimerAccepted")) {
      modal.style.display = "flex";
    }
    acceptBtn.addEventListener("click", () => {
      sessionStorage.setItem("disclaimerAccepted", "true");
      modal.style.display = "none";
    });
  }
});
