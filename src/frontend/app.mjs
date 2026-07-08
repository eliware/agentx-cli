const statusEl = document.querySelector('[data-ws-status]');
const replyEl = document.querySelector('[data-ws-reply]');
const connectButton = document.querySelector('[data-ws-connect]');

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function setReply(text) {
  if (replyEl) {
    replyEl.textContent = text;
  }
}

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  setStatus('connecting');
  setReply('waiting for echo');

  socket.addEventListener('open', () => {
    setStatus('connected');
    socket.send('hello from AgentX GUI');
  });

  socket.addEventListener('message', (event) => {
    setReply(event.data);
  });

  socket.addEventListener('close', () => {
    setStatus('closed');
  });

  socket.addEventListener('error', () => {
    setStatus('error');
  });
}

if (connectButton) {
  connectButton.addEventListener('click', connect);
}

connect();
