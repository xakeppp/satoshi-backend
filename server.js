import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(cors());
app.use(express.json());

// ============= ЗАЩИТА ОТ DDoS =============
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 50, // максимум 50 запросов с одного IP
  message: { error: 'Слишком много запросов, подождите' },
  skipSuccessfulRequests: true
});
app.use('/api/', limiter);

// Особо строгий лимит для рекордов
const recordLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 3, // максимум 3 рекорда в минуту
  message: { error: 'Слишком часто, подождите' }
});
app.use('/api/record', recordLimiter);

// ============= ХРАНИЛИЩА =============
const players = {};
let records = [];
const playerLastRecord = {};

// ============= HEALTH CHECK =============
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============= СОХРАНЕНИЕ ИГРОКА (с валидацией) =============
app.post('/api/player', (req, res) => {
  const { id, username, totalMerges, totalSpawns, totalSells, totalTime } = req.body;
  
  // Валидация: максимальные значения
  const safeMerges = Math.min(totalMerges || 0, 1000);
  const safeSpawns = Math.min(totalSpawns || 0, 1000);
  const safeSells = Math.min(totalSells || 0, 1000);
  const safeTime = Math.min(totalTime || 0, 86400); // максимум 24 часа
  
  if (!players[id]) {
    players[id] = { 
      id, 
      username, 
      totalMerges: 0, 
      totalSpawns: 0, 
      totalSells: 0, 
      totalTime: 0,
      createdAt: Date.now()
    };
  }
  
  if (safeMerges) players[id].totalMerges += safeMerges;
  if (safeSpawns) players[id].totalSpawns += safeSpawns;
  if (safeSells) players[id].totalSells += safeSells;
  if (safeTime) players[id].totalTime += safeTime;
  if (username) players[id].username = username;
  
  console.log(`📊 ${username} | объединений: ${players[id].totalMerges}`);
  res.json({ success: true });
});

// ============= ЛИДЕРБОРД =============
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

// ============= ОНЛАЙН СТАТИСТИКА =============
app.get('/api/online-stats', (req, res) => {
  // Убираем неактивных больше 5 минут
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const onlineCount = Object.values(players).filter(p => p.lastSeen > fiveMinutesAgo).length;
  res.json({ online: onlineCount || 1 });
});

app.get('/api/online-players', (req, res) => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const online = Object.values(players)
    .filter(p => p.lastSeen > fiveMinutesAgo)
    .slice(0, 10)
    .map(p => ({
      username: p.username,
      total_merges: p.totalMerges || 0
    }));
  res.json(online.length ? online : [{ username: 'Игрок', total_merges: 0 }]);
});

// ============= ОБЩАЯ СТАТИСТИКА =============
app.get('/api/total-stats', (req, res) => {
  const totalMerges = Object.values(players).reduce((sum, p) => sum + (p.totalMerges || 0), 0);
  const totalSpawns = Object.values(players).reduce((sum, p) => sum + (p.totalSpawns || 0), 0);
  const totalSells = Object.values(players).reduce((sum, p) => sum + (p.totalSells || 0), 0);
  const totalTime = Object.values(players).reduce((sum, p) => sum + (p.totalTime || 0), 0);
  
  res.json({ 
    total_merges: totalMerges, 
    total_spawns: totalSpawns, 
    total_sells: totalSells, 
    total_time_seconds: totalTime 
  });
});

// ============= РЕКОРДЫ (строгая валидация) =============
app.post('/api/record', (req, res) => {
  const { playerId, playerName, timeMs } = req.body;
  
  // ВАЛИДАЦИЯ: реальное время создания Вселенной (8-120 секунд)
  if (timeMs < 8000) {
    console.log(`⛔ Читерская попытка: ${playerName} за ${timeMs}ms`);
    return res.status(400).json({ error: 'Невозможное время!' });
  }
  
  if (timeMs > 120000) {
    return res.status(400).json({ error: 'Слишком медленно' });
  }
  
  // Анти-спам: рекорд не чаще 1 раза в 2 минуты
  const lastRecord = playerLastRecord[playerId];
  const TWO_MINUTES = 2 * 60 * 1000;
  if (lastRecord && Date.now() - lastRecord < TWO_MINUTES) {
    return res.status(429).json({ error: 'Слишком часто' });
  }
  playerLastRecord[playerId] = Date.now();
  
  // Сохраняем
  records.push({ playerId, playerName, timeMs, date: new Date() });
  records.sort((a, b) => a.timeMs - b.timeMs);
  records = records.slice(0, 50); // храним топ-50
  
  console.log(`🏆 Новый рекорд: ${playerName} — ${timeMs}ms`);
  res.json({ success: true });
});

// ============= ОБНОВЛЕНИЕ ВРЕМЕНИ ПОСЛЕДНЕЙ АКТИВНОСТИ =============
app.post('/api/ping', (req, res) => {
  const { playerId } = req.body;
  if (players[playerId]) {
    players[playerId].lastSeen = Date.now();
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Защищённый сервер запущен на порту ${PORT}`);
  console.log(`🚫 DDoS защита: 50 запросов/15 минут`);
  console.log(`🏆 Рекорды: мин 8 секунд, макс 1 в 2 минуты`);
});
