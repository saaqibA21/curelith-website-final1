const BASE_URL = 'https://d78739729426.ngrok-free.app/api';

const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');

let diagnosisSessionId = null;
let diagnosisStarted = false;

// 🧠 Append message to chat box
function addMessage(text, sender = 'user') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.textContent = (sender === 'user' ? '🧍 ' : '🤖 ') + text;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 🟢 Send message to backend (Auto: ask or diagnosis)
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';

  if (text.toLowerCase().startsWith("diagnose ")) {
    const symptom = text.slice(9).trim();
    startDiagnosis(symptom);
  } else if (diagnosisStarted) {
    sendFollowupDiagnosis(text);
  } else {
    try {
      const res = await fetch(`${BASE_URL}/ask/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      });
      if (!res.ok) throw new Error('❌ Server error');
      const data = await res.json();
      addMessage(data.answer || '⚠️ No response received', 'ai');
    } catch (err) {
      addMessage('❌ Error: ' + err.message, 'ai');
    }
  }
}

// 🧪 Start diagnosis
async function startDiagnosis(symptom) {
  diagnosisSessionId = crypto.randomUUID(); // 🔐 generate session id
  diagnosisStarted = true;

  try {
    const res = await fetch(`${BASE_URL}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptom, session_id: diagnosisSessionId })
    });

    const data = await res.json();
    if (data.intro) addMessage(data.intro, 'ai');
    if (data.question) addMessage(data.question, 'ai');
  } catch (err) {
    addMessage('❌ Diagnosis failed: ' + err.message, 'ai');
    diagnosisStarted = false;
  }
}

// 🔄 Follow-up diagnosis interaction
async function sendFollowupDiagnosis(userInputText) {
  try {
    const res = await fetch(`${BASE_URL}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_input: userInputText,
        session_id: diagnosisSessionId
      })
    });

    const data = await res.json();

    if (data.question) {
      addMessage(data.question, 'ai');
    } else if (data.done) {
      addMessage("🧠 Diagnosis Summary: " + data.summary, 'ai');
      if (data.guideline) {
        addMessage(`📘 Guideline for ${data.guideline.disease}:\n${data.guideline.plan}`, 'ai');
      }
      diagnosisStarted = false;
    } else {
      addMessage("⚠️ Unexpected response.", 'ai');
    }
  } catch (err) {
    addMessage('❌ Error: ' + err.message, 'ai');
    diagnosisStarted = false;
  }
}

// 🔁 Allow Enter key to send message
userInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// 📷 Image Analyzer with preview + result
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
          body: formData
        });

        if (!res.ok) throw new Error('❌ Analysis failed');
        const data = await res.json();
        imageResult.textContent = `🤖 ${data.result || "No diagnosis returned."}`;
      } catch (err) {
        imageResult.textContent = err.message;
      }
    });
  }
});


// Show disclaimer modal only once per session
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("disclaimerModal");
  const acceptBtn = document.getElementById("acceptDisclaimerBtn");

  if (!sessionStorage.getItem("disclaimerAccepted")) {
    modal.style.display = "flex";
  }

  acceptBtn.addEventListener("click", () => {
    sessionStorage.setItem("disclaimerAccepted", "true");
    modal.style.display = "none";
  });
});
