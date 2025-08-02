const BASE_URL = 'https://aeabcfe12903.ngrok-free.app/api'; // replace this every time ngrok URL changes

const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');

// 🧠 Append message to chat box
function addMessage(text, sender = 'user') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.textContent = (sender === 'user' ? '🧍 ' : '🤖 ') + text;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 🟢 Send message to backend
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  addMessage(text, 'user');
  userInput.value = '';

  try {
    const res = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_input: text })
    });

    if (!res.ok) throw new Error('❌ Server error');
    const data = await res.json();

    addMessage(data.answer || '⚠️ No response received', 'ai');
  } catch (err) {
    addMessage('❌ Error: ' + err.message, 'ai');
  }
}

// 🔁 Allow Enter key to send message
userInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});
