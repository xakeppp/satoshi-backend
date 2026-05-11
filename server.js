import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Хранилище в памяти (временное)
const players = {};
const records = [];

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Сохранение игрока
app.post('/api/player', (req, res) => {
  const { id, username, totalMerges, totalSpawns, totalSells, totalTime } = req.body;
  
  if (!players[id]) {
    players[id] = { id, username, totalMerges: 0, totalSpawns: 0, totalSells: 0, totalTime: 0 };
  }
  
  if (totalMerges) players[id].totalMerges += totalMerges;
  if (totalSpawns) players[id].totalSpawns += totalSpawns;
  if (totalSells) players[id].totalSells += totalSells;
  if (totalTime) players[id].totalTime += totalTime;
  if (username) players[id].username = username;
  
  console.log(`📊 Обновлён игрок: ${username} (${id})`);
  res.json({ success: true });
});

// Лидерборд
app.get('/api/leaderboard', (req, res) => {
  const list = Object.values(players)
    .sort((a, b) => (b.totalMerges || 0) - (a.totalMerges || 0))
    .slice(0, 10)
    .map(p => ({
      username: p.username,
      best_speedrun: null,
      total_merges: p.totalMerges || 0
    }));
  res.json(list);
});

// Онлайн статистика
app.get('/api/online-stats', (req, res) => {
  res.json({ online: Object.keys(players).length });
});

app.get('/api/online-players', (req, res) => {
  const online = Object.values(players).slice(0, 10).map(p => ({
    username: p.username,
    total_merges: p.totalMerges || 0
  }));
  res.json(online);
});

// Общая статистика
app.get('/api/total-stats', (req, res) => {
  const totalMerges = Object.values(players).reduce((sum, p) => sum + (p.totalMerges || 0), 0);
  const totalSpawns = Object.values(players).reduce((sum, p) => sum + (p.totalSpawns || 0), 0);
  const totalSells = Object.values(players).reduce((sum, p) => sum + (p.totalSells || 0), 0);
  const totalTime = Object.values(players).reduce((sum, p) => sum + (p.totalTime || 0), 0);
  
  res.json({ total_merges: totalMerges, total_spawns: totalSpawns, total_sells: totalSells, total_time_seconds: totalTime });
});

// Рекорды
app.post('/api/record', (req, res) => {
  const { playerId, playerName, timeMs } = req.body;
  records.push({ playerId, playerName, timeMs, date: new Date() });
  records.sort((a, b) => a.timeMs - b.timeMs);
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});