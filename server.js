const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

let words = [];
let wordOfTheDay = '';
const multiplayerSessions = new Map();
const soloSessions = new Map();

function loadWords() {
  const content = fs.readFileSync('words.txt', 'utf-8');

  // Load all words, filter only by length (6-10 letters for Tusmo rules)
  words = content.split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length >= 6 && w.length <= 10);

  console.log(`Loaded ${words.length} words`);
  setWordOfTheDay();
}

function setWordOfTheDay() {
  const today = new Date().toDateString();
  const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = seed % words.length;
  wordOfTheDay = words[index];
  console.log(`Word of the day set (length: ${wordOfTheDay.length})`);
}

function getRandomWord(length = null) {
  const filteredWords = length ? words.filter(w => w.length === length) : words;
  return filteredWords[Math.floor(Math.random() * filteredWords.length)];
}

// ============== TEST MODE - START (EASY TO DELETE) ==============
// Mode de test: si adminPseudo est "admin", utilise des mots fixes
function getTestWords(wordCount) {
  const testWords = ['SALADE', 'TOMATE']; // Mots avec premières lettres différentes pour tester
  const result = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(testWords[i % 2]); // Alterne entre SALADE et TOMATE
  }
  return result;
}
// ============== TEST MODE - END ==============

function checkGuess(word, guess) {
  const result = [];
  const wordArray = word.split('');
  const guessArray = guess.split('');
  const used = new Array(word.length).fill(false);

  for (let i = 0; i < guessArray.length; i++) {
    if (guessArray[i] === wordArray[i]) {
      result.push({ letter: guessArray[i], status: 'correct' });
      used[i] = true;
    } else {
      result.push({ letter: guessArray[i], status: 'absent' });
    }
  }

  for (let i = 0; i < guessArray.length; i++) {
    if (result[i].status === 'absent') {
      for (let j = 0; j < wordArray.length; j++) {
        if (!used[j] && guessArray[i] === wordArray[j]) {
          result[i].status = 'present';
          used[j] = true;
          break;
        }
      }
    }
  }

  return result;
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/word-of-the-day', (req, res) => {
  res.json({
    length: wordOfTheDay.length,
    firstLetter: wordOfTheDay[0]
  });
});

app.get('/api/debug/word-of-the-day', (req, res) => {
  res.json({
    word: wordOfTheDay,
    length: wordOfTheDay.length,
    firstLetter: wordOfTheDay[0]
  });
});

app.post('/api/check-word', (req, res) => {
  const { word, guess } = req.body;
  if (!word || !guess) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Determine which word to check against
  let targetWord;
  if (word === 'DAILY') {
    targetWord = wordOfTheDay;
  } else {
    // Check if it's a solo session ID
    const soloSession = soloSessions.get(word);
    if (soloSession) {
      targetWord = soloSession.word;
    } else {
      return res.status(400).json({ error: 'Invalid session' });
    }
  }

  // Tusmo rule: guess must start with the first letter
  if (guess.toUpperCase()[0] !== targetWord[0]) {
    return res.json({ valid: false, message: `Le mot doit commencer par ${targetWord[0]}` });
  }

  const isValid = words.includes(guess.toUpperCase());
  if (!isValid) {
    return res.json({ valid: false, message: 'Mot non trouvé dans le dictionnaire' });
  }

  const result = checkGuess(targetWord.toUpperCase(), guess.toUpperCase());
  res.json({ valid: true, result });
});

app.get('/api/random-word', (req, res) => {
  const length = req.query.length ? parseInt(req.query.length) : null;
  const word = getRandomWord(length);

  // Generate session ID for solo game
  const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase();
  soloSessions.set(sessionId, {
    word: word,
    createdAt: Date.now()
  });

  res.json({
    sessionId: sessionId,
    length: word.length,
    firstLetter: word[0]
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('reconnect-to-session', ({ sessionId, pseudo }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('reconnect-error', { message: 'Session introuvable ou expirée' });
      return;
    }

    let player = Array.from(session.players.values()).find(p => p.pseudo === pseudo);
    let isNewPlayer = false;

    if (!player) {
      // New player joining an existing session
      isNewPlayer = true;
      session.players.set(socket.id, {
        id: socket.id,
        pseudo,
        scores: [],
        totalScore: 0,
        startTime: session.gameStarted ? Date.now() : null,
        endTime: null,
        completionTime: null,
        currentWordIndex: 0
      });
      player = session.players.get(socket.id);
    } else {
      // Existing player reconnecting - update their socket ID while preserving order
      const oldId = player.id;

      // Store all players in order
      const playersArray = Array.from(session.players.entries());

      // Clear the map
      session.players.clear();

      // Re-add players in the same order, updating the reconnecting player's ID
      for (const [key, p] of playersArray) {
        if (key === oldId) {
          player.id = socket.id;
          session.players.set(socket.id, player);
        } else {
          session.players.set(key, p);
        }
      }
    }

    socket.join(sessionId);

    // Check if this player is the admin (by pseudo since socket ID changes)
    const isAdmin = Array.from(session.players.values())[0]?.pseudo === pseudo;
    if (isAdmin) {
      session.adminId = socket.id;
    }

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    // Use PLAYER's current word index, not session's
    const playerWordIndex = player.currentWordIndex;
    const currentWord = session.gameStarted && session.words[playerWordIndex] ? {
      length: session.words[playerWordIndex].length,
      firstLetter: session.words[playerWordIndex][0],
      wordNumber: playerWordIndex + 1,
      totalWords: session.words.length
    } : null;

    // Send reconnection data to the player
    socket.emit('reconnected-to-session', {
      sessionId,
      config: session.config,
      players,
      isAdmin,
      gameStarted: session.gameStarted,
      currentWordIndex: playerWordIndex,
      currentWord,
      previousGuesses: player.scores[playerWordIndex]?.guesses || []
    });

    // Notify other players that someone (re)joined
    socket.to(sessionId).emit('player-joined', {
      players,
      newPlayer: { id: socket.id, pseudo }
    });

    console.log(`${pseudo} ${isNewPlayer ? 'joined' : 'reconnected to'} session ${sessionId}`);
  });

  socket.on('create-session', ({ pseudo, wordCount, wordLengthMode }) => {
    const sessionId = generateSessionId();

    const config = {
      wordCount: parseInt(wordCount) || 1,
      wordLengthMode: wordLengthMode || 'random'
    };

    // ============== TEST MODE - START (EASY TO DELETE) ==============
    const words = pseudo === 'admin' ? getTestWords(config.wordCount) : [];

    if (pseudo !== 'admin') {
    // ============== TEST MODE - END ==============
      for (let i = 0; i < config.wordCount; i++) {
        let wordLength = null;

        if (config.wordLengthMode === 'random') {
          wordLength = Math.floor(Math.random() * 5) + 6;
        } else if (config.wordLengthMode === 'progressive') {
          wordLength = 6 + (i % 5);
        } else if (config.wordLengthMode.startsWith('fixed-')) {
          wordLength = parseInt(config.wordLengthMode.split('-')[1]);
        }

        words.push(getRandomWord(wordLength));
      }
    // ============== TEST MODE - START (EASY TO DELETE) ==============
    }
    // ============== TEST MODE - END ==============

    multiplayerSessions.set(sessionId, {
      id: sessionId,
      words: words,
      currentWordIndex: 0,
      config: config,
      adminId: socket.id,
      adminPseudo: pseudo, // ============== TEST MODE (EASY TO DELETE) ==============
      players: new Map([[socket.id, { id: socket.id, pseudo, scores: [], totalScore: 0, startTime: null, endTime: null, completionTime: null, currentWordIndex: 0 }]]),
      gameStarted: false,
      gameStartTime: null,
      createdAt: Date.now()
    });

    socket.join(sessionId);
    socket.emit('session-created', {
      sessionId,
      config,
      isAdmin: true
    });

    console.log(`Session ${sessionId} created by ${pseudo} (admin)`);
  });

  socket.on('join-session', ({ sessionId, pseudo }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    if (session.gameStarted) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    session.players.set(socket.id, {
      id: socket.id,
      pseudo,
      scores: [],
      totalScore: 0,
      startTime: null,
      endTime: null,
      completionTime: null,
      currentWordIndex: 0
    });

    socket.join(sessionId);

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    const isAdmin = socket.id === session.adminId;

    socket.emit('session-joined', {
      sessionId,
      config: session.config,
      players,
      isAdmin
    });

    io.to(sessionId).emit('player-joined', { pseudo, players });
    console.log(`${pseudo} joined session ${sessionId}`);
  });

  socket.on('start-game', ({ sessionId }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session || socket.id !== session.adminId) {
      return;
    }

    // Generate new words if game was already played
    if (session.gameStarted || session.gameStartTime !== null) {
      // ============== TEST MODE - START (EASY TO DELETE) ==============
      const words = session.adminPseudo === 'admin' ? getTestWords(session.config.wordCount) : [];

      if (session.adminPseudo !== 'admin') {
      // ============== TEST MODE - END ==============
        for (let i = 0; i < session.config.wordCount; i++) {
          let wordLength = null;

          if (session.config.wordLengthMode === 'random') {
            wordLength = Math.floor(Math.random() * 5) + 6;
          } else if (session.config.wordLengthMode === 'progressive') {
            wordLength = 6 + (i % 5);
          } else if (session.config.wordLengthMode.startsWith('fixed-')) {
            wordLength = parseInt(session.config.wordLengthMode.split('-')[1]);
          }

          words.push(getRandomWord(wordLength));
        }
      // ============== TEST MODE - START (EASY TO DELETE) ==============
      }
      // ============== TEST MODE - END ==============
      session.words = words;
    }

    session.gameStarted = true;
    session.currentWordIndex = 0;
    session.gameStartTime = Date.now();

    // Reset and initialize all players
    for (const player of session.players.values()) {
      player.scores = [];
      player.totalScore = 0;
      player.startTime = session.gameStartTime;
      player.endTime = null;
      player.completionTime = null;
      player.currentWordIndex = 0; // Track each player's current word
    }

    const currentWord = session.words[0];

    io.to(sessionId).emit('game-started', {
      wordLength: currentWord.length,
      firstLetter: currentWord[0],
      wordNumber: 1,
      totalWords: session.words.length
    });

    console.log(`Game started in session ${sessionId}`);
  });

  socket.on('typing-update', ({ sessionId, currentInput, wordNumber }) => {
    const session = multiplayerSessions.get(sessionId);
    if (!session || !session.gameStarted) return;

    const player = session.players.get(socket.id);
    if (!player) return;

    // Get word length for current word
    const wordLength = session.words[player.currentWordIndex]?.length || 6;

    // Broadcast to other players
    socket.to(sessionId).emit('player-typing', {
      playerId: socket.id,
      pseudo: player.pseudo,
      currentInput,
      wordNumber: player.currentWordIndex + 1,
      wordLength
    });
  });

  socket.on('submit-guess', ({ sessionId, guess }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session || !session.gameStarted) {
      return;
    }

    const player = session.players.get(socket.id);
    if (!player) {
      return;
    }

    const guessUpper = guess.toUpperCase();

    // Use player's current word index (each player progresses independently)
    const currentWordIndexBeforeUpdate = player.currentWordIndex; // Save before any updates
    const currentWord = session.words[player.currentWordIndex];

    // Tusmo rule: guess must start with the first letter
    if (guessUpper[0] !== currentWord[0]) {
      socket.emit('invalid-word', { message: `Le mot doit commencer par ${currentWord[0]}` });
      return;
    }

    if (!words.includes(guessUpper)) {
      socket.emit('invalid-word', { message: 'Mot non trouvé dans le dictionnaire' });
      return;
    }
    const result = checkGuess(currentWord, guessUpper);
    const isCorrect = result.every(r => r.status === 'correct');

    if (!player.scores[player.currentWordIndex]) {
      player.scores[player.currentWordIndex] = { guesses: [], attempts: 0, found: false };
    }

    player.scores[player.currentWordIndex].guesses.push({ guess: guessUpper, result });
    player.scores[player.currentWordIndex].attempts++;

    if (isCorrect) {
      player.scores[player.currentWordIndex].found = true;
      const score = Math.max(7 - player.scores[player.currentWordIndex].attempts, 1);
      player.totalScore += score;

      // Notify all players about the word completion
      io.to(sessionId).emit('player-won-word', {
        pseudo: player.pseudo,
        attempts: player.scores[player.currentWordIndex].attempts,
        wordNumber: player.currentWordIndex + 1,
        totalWords: session.words.length,
        totalScore: player.totalScore
      });

      // Check if player finished all words
      const allWordsCompleted = player.scores.filter(s => s && s.found).length === session.words.length;
      if (allWordsCompleted && !player.endTime) {
        player.endTime = Date.now();
        player.completionTime = player.endTime - player.startTime;

        io.to(sessionId).emit('player-finished', {
          pseudo: player.pseudo,
          completionTime: player.completionTime,
          totalScore: player.totalScore
        });

        // Generate current leaderboard
        const leaderboard = Array.from(session.players.values()).map(p => ({
          pseudo: p.pseudo,
          totalScore: p.totalScore,
          completionTime: p.completionTime,
          scores: p.scores.map((s, idx) => ({
            wordNumber: idx + 1,
            attempts: s ? s.attempts : 0,
            found: s ? s.found : false,
            guesses: s ? s.guesses : []
          }))
        })).sort((a, b) => {
          // Time-based ranking: first to finish wins
          // Players who completed rank higher than eliminated players
          if (a.completionTime !== null && b.completionTime === null) return -1;
          if (a.completionTime === null && b.completionTime !== null) return 1;
          if (a.completionTime === null && b.completionTime === null) {
            // Both eliminated - sort by score
            return b.totalScore - a.totalScore;
          }
          // Both completed - sort by time (fastest first)
          return a.completionTime - b.completionTime;
        });

        // Send leaderboard to the player who just finished
        socket.emit('player-completed', { leaderboard });

        // Check if all players finished
        const allPlayersFinished = Array.from(session.players.values()).every(p => p.endTime !== null);
        if (allPlayersFinished) {
          io.to(sessionId).emit('game-completed', { leaderboard });
          console.log(`Game completed in session ${sessionId}`);
        }
      } else if (!allWordsCompleted) {
        // Player has more words to play - advance to next word
        player.currentWordIndex++; // Move to next word

        if (player.currentWordIndex < session.words.length) {
          const nextWord = session.words[player.currentWordIndex];

          // Send next word info to this player
          socket.emit('next-word', {
            wordLength: nextWord.length,
            firstLetter: nextWord[0],
            wordNumber: player.currentWordIndex + 1,
            totalWords: session.words.length,
            totalScore: player.totalScore
          });

          // Notify other players that this player moved to next word
          socket.broadcast.to(sessionId).emit('player-changed-word', {
            playerId: socket.id,
            pseudo: player.pseudo,
            wordNumber: player.currentWordIndex + 1,
            totalWords: session.words.length
          });
        }
      }
    }

    // Check if player failed current word (max attempts reached without finding it)
    const maxAttempts = 6;
    if (!isCorrect && player.scores[player.currentWordIndex].attempts >= maxAttempts && !player.endTime) {
      // Player failed a word - they are eliminated
      player.endTime = Date.now();
      player.completionTime = null; // Keep null to show as eliminated

      io.to(sessionId).emit('player-finished', {
        pseudo: player.pseudo,
        completionTime: null,
        totalScore: player.totalScore,
        eliminated: true
      });

      // Generate current leaderboard
      const leaderboard = Array.from(session.players.values()).map(p => ({
        pseudo: p.pseudo,
        totalScore: p.totalScore,
        completionTime: p.completionTime,
        scores: p.scores.map((s, idx) => ({
          wordNumber: idx + 1,
          attempts: s ? s.attempts : 0,
          found: s ? s.found : false,
          guesses: s ? s.guesses : []
        }))
      })).sort((a, b) => {
        // Time-based ranking: first to finish wins
        if (a.completionTime !== null && b.completionTime === null) return -1;
        if (a.completionTime === null && b.completionTime !== null) return 1;
        if (a.completionTime === null && b.completionTime === null) {
          return b.totalScore - a.totalScore;
        }
        return a.completionTime - b.completionTime;
      });

      // Send leaderboard to the player who just failed
      socket.emit('player-completed', { leaderboard });

      // Check if all players finished
      const allPlayersFinished = Array.from(session.players.values()).every(p => p.endTime !== null);
      if (allPlayersFinished) {
        io.to(sessionId).emit('game-completed', { leaderboard });
        console.log(`Game completed in session ${sessionId}`);
      }
    }

    socket.emit('guess-result', {
      result,
      isCorrect,
      guessNumber: player.scores[currentWordIndexBeforeUpdate]?.attempts || 0,
      wordNumber: currentWordIndexBeforeUpdate + 1 // Use the saved value before increment
    });

    socket.to(sessionId).emit('player-attempt-update', {
      playerId: socket.id,
      pseudo: player.pseudo,
      result: result,
      totalScore: player.totalScore,
      currentWordIndex: player.currentWordIndex
    });

    const playersData = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore,
      currentWordIndex: p.currentWordIndex,
      attempts: p.scores[p.currentWordIndex]?.guesses.map(g => g.result) || []
    }));

    io.to(sessionId).emit('players-update', { playersData });

    if (isCorrect) {
      io.to(sessionId).emit('player-won-word', {
        pseudo: player.pseudo,
        attempts: player.scores[session.currentWordIndex].attempts
      });
    }
  });

  socket.on('replay-session', ({ sessionId }) => {
    const session = multiplayerSessions.get(sessionId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    // Reset session state
    session.gameStarted = false;
    session.currentWordIndex = 0;
    session.gameStartTime = null;

    // Generate new words with same config
    const words = [];
    for (let i = 0; i < session.config.wordCount; i++) {
      let wordLength = null;

      if (session.config.wordLengthMode === 'random') {
        wordLength = Math.floor(Math.random() * 5) + 6;
      } else if (session.config.wordLengthMode === 'progressive') {
        wordLength = 6 + (i % 5);
      } else if (session.config.wordLengthMode.startsWith('fixed-')) {
        wordLength = parseInt(session.config.wordLengthMode.split('-')[1]);
      }

      words.push(getRandomWord(wordLength));
    }
    session.words = words;

    // Reset all players
    for (const player of session.players.values()) {
      player.scores = [];
      player.totalScore = 0;
      player.startTime = null;
      player.endTime = null;
      player.completionTime = null;
      player.currentWordIndex = 0;
    }

    const players = Array.from(session.players.values()).map(p => ({
      id: p.id,
      pseudo: p.pseudo,
      totalScore: p.totalScore
    }));

    // Notify all players to return to waiting room
    io.to(sessionId).emit('session-reset', {
      sessionId,
      config: session.config,
      players
    });

    console.log(`Session ${sessionId} reset for replay`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const [sessionId, session] of multiplayerSessions.entries()) {
      if (session.players.has(socket.id)) {
        const player = session.players.get(socket.id);
        const wasAdmin = socket.id === session.adminId;
        session.players.delete(socket.id);

        if (session.players.size === 0) {
          multiplayerSessions.delete(sessionId);
          console.log(`Session ${sessionId} deleted (no players)`);
        } else {
          if (wasAdmin) {
            const newAdminId = Array.from(session.players.keys())[0];
            session.adminId = newAdminId;
            io.to(newAdminId).emit('promoted-to-admin');
            console.log(`New admin in session ${sessionId}: ${newAdminId}`);
          }

          const players = Array.from(session.players.values()).map(p => ({
            id: p.id,
            pseudo: p.pseudo,
            totalScore: p.totalScore
          }));
          io.to(sessionId).emit('player-left', {
            pseudo: player.pseudo,
            players
          });
        }
        break;
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [sessionId, session] of multiplayerSessions.entries()) {
    if (now - session.createdAt > oneHour) {
      multiplayerSessions.delete(sessionId);
      console.log(`Session ${sessionId} expired`);
    }
  }
}, 5 * 60 * 1000);

loadWords();

setInterval(() => {
  const currentWordOfTheDay = wordOfTheDay;
  setWordOfTheDay();
  if (currentWordOfTheDay !== wordOfTheDay) {
    console.log('Word of the day updated');
  }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Motus game server running on port ${PORT}`);
});
