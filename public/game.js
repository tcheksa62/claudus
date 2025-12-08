let socket;
let currentScreen = 'menu';
let gameState = {
    mode: null,
    word: null,
    wordLength: 0,
    firstLetter: '',
    guesses: [],
    maxGuesses: 6,
    pseudo: '',
    sessionId: null,
    players: [],
    correctLetters: [],
    currentInput: '',
    letterStatus: {},
    gameStarted: false,
    soloScore: 0,
    soloWordLength: 6
};

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    currentScreen = screenId;
}

function showMenu() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    clearSessionFromLocalStorage();
    resetGameState();

    // Clear URL parameters (remove ?session=XXXXX from URL)
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, document.title, url.pathname);

    showScreen('menu-screen');
}

function updateWordCountDisplay(value) {
    document.getElementById('word-count-display').textContent = value;
}

function resetGameState() {
    gameState = {
        mode: null,
        word: null,
        wordLength: 0,
        firstLetter: '',
        guesses: [],
        maxGuesses: 6,
        pseudo: '',
        sessionId: null,
        players: [],
        correctLetters: [],
        currentInput: '',
        letterStatus: {},
        gameStarted: false,
        soloScore: 0,
        soloWordLength: 6
    };
}

function showMessage(message, type = 'info') {
    const messageBox = document.getElementById('message-box');
    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
    setTimeout(() => {
        messageBox.textContent = '';
        messageBox.className = 'message-box';
    }, 3000);
}

async function startWordOfTheDay() {
    try {
        const response = await fetch('/api/word-of-the-day');
        const data = await response.json();

        gameState.mode = 'word-of-the-day';
        gameState.wordLength = data.length;
        gameState.firstLetter = data.firstLetter;
        gameState.word = null;
        gameState.pseudo = 'Joueur';

        initializeGameBoard();
        showScreen('game-screen');

        document.getElementById('player-name').textContent = gameState.pseudo;
        document.getElementById('game-mode').textContent = '📅 Mot du Jour';
    } catch (error) {
        showMessage('Erreur lors du chargement du mot du jour', 'error');
    }
}

function showSoloConfig() {
    showScreen('solo-config-screen');
}

async function startSoloGame() {
    const pseudo = document.getElementById('solo-pseudo').value.trim();
    const wordLength = parseInt(document.getElementById('word-length').value);

    if (!pseudo) {
        alert('Veuillez entrer un pseudo');
        return;
    }

    gameState.mode = 'solo';
    gameState.pseudo = pseudo;
    gameState.soloScore = 0;
    gameState.soloWordLength = wordLength;

    await loadNextSoloWord();
}

async function loadNextSoloWord() {
    try {
        const response = await fetch(`/api/random-word?length=${gameState.soloWordLength}`);
        const data = await response.json();

        gameState.wordLength = data.length;
        gameState.firstLetter = data.firstLetter;
        gameState.soloSessionId = data.sessionId;
        gameState.word = null;
        gameState.guesses = [];
        gameState.correctLetters = [];
        gameState.currentInput = '';
        gameState.letterStatus = {};

        initializeGameBoard();
        showScreen('game-screen');

        document.getElementById('player-name').textContent = gameState.pseudo;
        document.getElementById('game-mode').textContent = `🎮 Solo - Score: ${gameState.soloScore}`;
    } catch (error) {
        showMessage('Erreur lors du chargement du mot', 'error');
    }
}

function showMultiplayerLobby() {
    showScreen('multiplayer-lobby-screen');
}

function createSession() {
    const pseudo = document.getElementById('lobby-pseudo').value.trim();
    const wordCount = parseInt(document.getElementById('mp-word-count').value);
    const wordLengthMode = document.getElementById('mp-word-length-mode').value;

    if (!pseudo) {
        alert('Veuillez entrer un pseudo');
        return;
    }

    gameState.pseudo = pseudo;
    gameState.mode = 'multiplayer';
    gameState.isAdmin = true;

    console.log('[CREATE-SESSION] Creating socket connection...');
    socket = io();

    console.log('[CREATE-SESSION] Setting up socket handlers...');
    setupMultiplayerSocketHandlers();

    socket.on('session-created', (data) => {
        console.log('[SESSION-CREATED] Received:', data);
        gameState.sessionId = data.sessionId;
        gameState.config = data.config;
        gameState.isAdmin = data.isAdmin;
        gameState.players = [{ id: socket.id, pseudo: gameState.pseudo, totalScore: 0 }];

        saveSessionToLocalStorage();

        document.getElementById('session-code-display').textContent = data.sessionId;
        displayGameConfig(data.config);
        updatePlayersList(gameState.players);
        showAdminControls(data.isAdmin);
        showScreen('waiting-room-screen');

        console.log('[SESSION-CREATED] Waiting room displayed. Game started handler is registered:', !!socket.listeners('game-started').length);
    });

    socket.on('connect', () => {
        console.log('[SOCKET] Connected with ID:', socket.id);
    });

    console.log('[CREATE-SESSION] Emitting create-session event...');
    socket.emit('create-session', { pseudo, wordCount, wordLengthMode });
}

function joinSession() {
    const pseudo = document.getElementById('lobby-pseudo').value.trim();
    const sessionId = document.getElementById('session-id-input').value.trim().toUpperCase();

    if (!pseudo) {
        alert('Veuillez entrer un pseudo');
        return;
    }

    if (!sessionId) {
        alert('Veuillez entrer un code de session');
        return;
    }

    gameState.pseudo = pseudo;
    gameState.mode = 'multiplayer';
    gameState.isAdmin = false;

    socket = io();

    setupMultiplayerSocketHandlers();

    socket.on('session-joined', (data) => {
        gameState.sessionId = data.sessionId;
        gameState.config = data.config;
        gameState.isAdmin = data.isAdmin;
        gameState.players = data.players;

        saveSessionToLocalStorage();

        document.getElementById('session-code-display').textContent = data.sessionId;
        displayGameConfig(data.config);
        updatePlayersList(data.players);
        showAdminControls(data.isAdmin);
        showScreen('waiting-room-screen');
    });

    socket.emit('join-session', { sessionId, pseudo });
}

function setupMultiplayerSocketHandlers() {
    socket.on('player-joined', (data) => {
        gameState.players = data.players;
        updatePlayersList(data.players);
    });

    socket.on('player-left', (data) => {
        gameState.players = data.players;
        updatePlayersList(data.players);
    });

    socket.on('promoted-to-admin', () => {
        gameState.isAdmin = true;
        showAdminControls(true);
        showMessage('Vous êtes maintenant l\'administrateur!', 'info');
    });

    socket.on('game-started', (data) => {
        console.log('[GAME-STARTED] Event received:', data);
        console.log('[GAME-STARTED] Current players:', gameState.players);

        try {
            gameState.wordLength = data.wordLength;
            gameState.firstLetter = data.firstLetter;
            gameState.currentWordNumber = data.wordNumber;
            gameState.totalWords = data.totalWords;

            console.log('[GAME-STARTED] Calling initializeGameBoard...');
            initializeGameBoard();
            console.log('[GAME-STARTED] initializeGameBoard completed');

            console.log('[GAME-STARTED] Calling showScreen...');
            showScreen('game-screen');
            console.log('[GAME-STARTED] showScreen completed');

            document.getElementById('player-name').textContent = gameState.pseudo;
            document.getElementById('game-mode').textContent = `👥 Mot ${data.wordNumber}/${data.totalWords}`;

            console.log('[GAME-STARTED] Setting live view display...');
            const liveView = document.getElementById('multiplayer-live-view');
            if (liveView) {
                liveView.style.display = 'block';
                console.log('[GAME-STARTED] Live view displayed');
            } else {
                console.error('[GAME-STARTED] Live view element not found!');
            }

            console.log('[GAME-STARTED] Calling initializeLiveView...');
            initializeLiveView();
            console.log('[GAME-STARTED] All setup complete!');
        } catch (error) {
            console.error('[GAME-STARTED] Error during setup:', error);
        }
    });

    socket.on('guess-result', (data) => {
        console.log('[GUESS-RESULT] Received, currentWordNumber:', gameState.currentWordNumber);

        // Don't display guess if we've already moved to the next word
        // This can happen if the server sends next-word before guess-result
        if (data.wordNumber && data.wordNumber !== gameState.currentWordNumber) {
            console.log('[GUESS-RESULT] Ignoring - word mismatch:', data.wordNumber, 'vs', gameState.currentWordNumber);
            return;
        }

        displayGuess(data.result);
        gameState.guesses.push(data.result);

        // Reset currentInput to current first letter after displaying the guess
        gameState.currentInput = gameState.firstLetter;

        if (data.isCorrect) {
            setTimeout(() => showMessage('Mot trouvé! Bien joué!', 'success'), 1000);
        } else if (gameState.guesses.length >= gameState.maxGuesses) {
            setTimeout(() => showMessage('Mot non trouvé...', 'error'), 1000);
        }
    });

    socket.on('invalid-word', (data) => {
        showMessage(data.message, 'error');
        gameState.currentInput = gameState.firstLetter;
        updateCurrentRowInput();
    });

    socket.on('players-update', (data) => {
        updateLiveView(data.playersData);
    });

    socket.on('player-attempt-update', (data) => {
        updatePlayerAttemptInLiveView(data);
    });

    socket.on('player-won-word', (data) => {
        if (data.pseudo !== gameState.pseudo) {
            showMessage(`${data.pseudo} a trouvé le mot en ${data.attempts} essais!`, 'info');
        }
    });

    socket.on('next-word', (data) => {
        console.log('[NEXT-WORD] Received:', data);

        // Player is advancing to the next word
        gameState.wordLength = data.wordLength;
        gameState.firstLetter = data.firstLetter;
        gameState.currentWordNumber = data.wordNumber;
        gameState.totalWords = data.totalWords;

        // IMPORTANT: Reset currentInput to the NEW first letter BEFORE initializing board
        // This prevents the old first letter from being displayed
        gameState.currentInput = data.firstLetter;

        console.log('[NEXT-WORD] Updated gameState - firstLetter:', gameState.firstLetter, 'wordLength:', gameState.wordLength, 'currentInput:', gameState.currentInput);

        // Show message about moving to next word
        if (data.failedPreviousWord) {
            showMessage(`Mot non trouvé... Passage au mot ${data.wordNumber}/${data.totalWords}`, 'error');
        } else {
            showMessage(`Bien joué! Passage au mot ${data.wordNumber}/${data.totalWords}`, 'success');
        }

        // Reinitialize the game board for the next word (this will reset guesses, letterStatus, etc.)
        console.log('[NEXT-WORD] Calling initializeGameBoard...');
        initializeGameBoard();
        console.log('[NEXT-WORD] After init - currentInput:', gameState.currentInput);

        // Update the game mode display
        document.getElementById('game-mode').textContent = `👥 Mot ${data.wordNumber}/${data.totalWords}`;
    });

    socket.on('player-changed-word', (data) => {
        console.log('[PLAYER-CHANGED-WORD] Player', data.pseudo, 'moved to word', data.wordNumber);

        // Reset the live view attempts for this specific player
        const attemptsContainer = document.getElementById(`live-attempts-${data.playerId}`);
        if (attemptsContainer) {
            attemptsContainer.innerHTML = '';
        }

        showMessage(`${data.pseudo} passe au mot ${data.wordNumber}/${data.totalWords}`, 'info');
    });

    socket.on('player-finished', (data) => {
        if (data.eliminated) {
            showMessage(`❌ ${data.pseudo} a été éliminé - Score: ${data.totalScore}`, 'error');
        } else {
            const minutes = Math.floor(data.completionTime / 60000);
            const seconds = Math.floor((data.completionTime % 60000) / 1000);
            const timeStr = minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;
            showMessage(`🏆 ${data.pseudo} a terminé! Temps: ${timeStr} - Score: ${data.totalScore}`, 'success');
        }
    });

    socket.on('player-completed', (data) => {
        // This player finished - show them the leaderboard
        showPostGameLobby(data.leaderboard);
    });

    socket.on('game-completed', (data) => {
        // All players finished - show/update leaderboard
        showPostGameLobby(data.leaderboard);
    });

    socket.on('session-reset', (data) => {
        gameState.sessionId = data.sessionId;
        gameState.gameStarted = false;

        document.getElementById('session-code-display').textContent = data.sessionId;
        displayGameConfig(data.config);
        updatePlayersList(data.players);
        showAdminControls(gameState.isAdmin);

        // Reset the start button if it exists
        const startButton = document.querySelector('#admin-controls .btn-large');
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = '🎮 Démarrer la partie';
        }

        showScreen('waiting-room-screen');
        showMessage('Nouvelle partie! En attente du démarrage...', 'info');
    });

    socket.on('reconnected-to-session', (data) => {
        console.log('Reconnected to session:', data);

        gameState.sessionId = data.sessionId;
        gameState.config = data.config;
        gameState.isAdmin = data.isAdmin;
        gameState.players = data.players;

        // Check if player wants to stay in lobby regardless of game state
        if (gameState.forceStayInLobby) {
            gameState.forceStayInLobby = false; // Reset flag
            document.getElementById('session-code-display').textContent = data.sessionId;
            displayGameConfig(data.config);
            updatePlayersList(data.players);
            showAdminControls(data.isAdmin);

            // Reset the start button if admin
            const startButton = document.querySelector('#admin-controls .btn-large');
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = '🎮 Démarrer la partie';
            }

            showScreen('waiting-room-screen');
            showMessage('De retour dans le lobby', 'info');
        } else if (data.gameStarted && data.currentWord) {
            gameState.wordLength = data.currentWord.length;
            gameState.firstLetter = data.currentWord.firstLetter;
            gameState.currentWordNumber = data.currentWord.wordNumber;
            gameState.totalWords = data.currentWord.totalWords;

            initializeGameBoard();
            showScreen('game-screen');

            document.getElementById('player-name').textContent = gameState.pseudo;
            document.getElementById('game-mode').textContent = `👥 Mot ${data.currentWord.wordNumber}/${data.currentWord.totalWords}`;

            const liveView = document.getElementById('multiplayer-live-view');
            if (liveView) {
                liveView.style.display = 'block';
            }
            initializeLiveView();

            showMessage('Reconnecté à la partie en cours', 'info');
        } else {
            document.getElementById('session-code-display').textContent = data.sessionId;
            displayGameConfig(data.config);
            updatePlayersList(data.players);
            showAdminControls(data.isAdmin);

            showScreen('waiting-room-screen');
            showMessage('Reconnecté au lobby', 'info');
        }
    });

    socket.on('error', (data) => {
        alert(data.message);
    });
}

function displayGameConfig(config) {
    const configDisplay = document.getElementById('game-config-display');
    let lengthText = '';

    if (config.wordLengthMode === 'random') {
        lengthText = 'Aléatoire (6-10 lettres)';
    } else if (config.wordLengthMode === 'progressive') {
        lengthText = 'Progressif (6→10)';
    } else {
        lengthText = `Fixe: ${config.wordLengthMode.split('-')[1]} lettres`;
    }

    configDisplay.innerHTML = `
        <p>📊 Configuration:</p>
        <p>Nombre de mots: ${config.wordCount}</p>
        <p>Longueur: ${lengthText}</p>
    `;
}

function showAdminControls(isAdmin) {
    if (isAdmin) {
        document.getElementById('admin-controls').style.display = 'block';
        document.getElementById('waiting-message').style.display = 'none';
    } else {
        document.getElementById('admin-controls').style.display = 'none';
        document.getElementById('waiting-message').style.display = 'block';
    }
}

function updatePlayersList(players) {
    gameState.players = players;
    const container = document.getElementById('players-container');
    container.innerHTML = '';

    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <span class="player-name">${player.pseudo}</span>
            <span class="player-status">Score: ${player.totalScore || 0}</span>
        `;
        container.appendChild(card);
    });
}

function initializeLiveView() {
    const container = document.getElementById('live-players-container');
    container.innerHTML = '';

    gameState.players.forEach(player => {
        if (player.pseudo !== gameState.pseudo) {
            const section = document.createElement('div');
            section.className = 'live-player-section';
            section.id = `live-player-${player.id}`;
            section.innerHTML = `
                <div class="live-player-header">
                    <span class="live-player-name">${player.pseudo}</span>
                    <span class="live-player-word">Mot 1/${gameState.totalWords || '?'}</span>
                </div>
                <div class="live-player-attempts" id="live-attempts-${player.id}"></div>
            `;
            container.appendChild(section);
        }
    });
}

function updateLiveView(playersData) {
    if (!playersData) return;

    playersData.forEach(playerData => {
        if (playerData.pseudo !== gameState.pseudo) {
            updatePlayerLiveSection(playerData);
        }
    });
}

function updatePlayerLiveSection(playerData) {
    const wordElement = document.querySelector(`#live-player-${playerData.id} .live-player-word`);
    if (wordElement && playerData.currentWordIndex !== undefined) {
        const wordNumber = playerData.currentWordIndex + 1;
        wordElement.textContent = `Mot ${wordNumber}/${gameState.totalWords || '?'}`;
    }

    const attemptsContainer = document.getElementById(`live-attempts-${playerData.id}`);
    if (attemptsContainer && playerData.attempts !== undefined) {
        attemptsContainer.innerHTML = '';

        playerData.attempts.forEach(attempt => {
            const row = document.createElement('div');
            row.className = 'live-attempt-row';

            attempt.forEach(tile => {
                const tileDiv = document.createElement('div');
                tileDiv.className = `live-tile ${tile.status}`;
                row.appendChild(tileDiv);
            });

            attemptsContainer.appendChild(row);
        });
    }
}

function updatePlayerAttemptInLiveView(data) {
    const attemptsContainer = document.getElementById(`live-attempts-${data.playerId}`);
    if (!attemptsContainer) return;

    const row = document.createElement('div');
    row.className = 'live-attempt-row';

    data.result.forEach(tile => {
        const tileDiv = document.createElement('div');
        tileDiv.className = `live-tile ${tile.status}`;
        row.appendChild(tileDiv);
    });

    attemptsContainer.appendChild(row);

    const wordElement = document.querySelector(`#live-player-${data.playerId} .live-player-word`);
    if (wordElement && data.currentWordIndex !== undefined) {
        const wordNumber = data.currentWordIndex + 1;
        wordElement.textContent = `Mot ${wordNumber}/${gameState.totalWords || '?'}`;
    }
}

function copySessionLink() {
    const sessionId = gameState.sessionId;
    const url = `${window.location.origin}?session=${sessionId}`;

    navigator.clipboard.writeText(url).then(() => {
        showMessage('Lien copié dans le presse-papier!', 'success');
    }).catch(() => {
        prompt('Copiez ce lien:', url);
    });
}

function leaveSession() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    showMenu();
}

function startMultiplayerGame() {
    console.log('[START-GAME] Button clicked');
    console.log('[START-GAME] isAdmin:', gameState.isAdmin);
    console.log('[START-GAME] gameStarted:', gameState.gameStarted);
    console.log('[START-GAME] sessionId:', gameState.sessionId);
    console.log('[START-GAME] socket exists:', !!socket);
    console.log('[START-GAME] socket connected:', socket?.connected);

    if (!gameState.isAdmin || gameState.gameStarted) {
        console.log('[START-GAME] Aborting - not admin or already started');
        return;
    }

    gameState.gameStarted = true;

    const startButton = document.querySelector('#admin-controls .btn-large');
    if (startButton) {
        startButton.disabled = true;
        startButton.textContent = 'Démarrage...';
        console.log('[START-GAME] Button disabled');
    }

    console.log('[START-GAME] Emitting start-game event...');
    socket.emit('start-game', { sessionId: gameState.sessionId });
    console.log('[START-GAME] Event emitted');
}

function initializeGameBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    gameState.guesses = [];
    gameState.correctLetters = new Array(gameState.wordLength).fill('');
    gameState.correctLetters[0] = gameState.firstLetter;
    gameState.currentInput = gameState.firstLetter;
    gameState.letterStatus = {};

    document.getElementById('first-letter').textContent = gameState.wordLength;
    document.getElementById('attempt-count').textContent = '0';

    for (let i = 0; i < gameState.maxGuesses; i++) {
        const row = document.createElement('div');
        row.className = 'guess-row';
        row.dataset.rowIndex = i;
        for (let j = 0; j < gameState.wordLength; j++) {
            const tile = document.createElement('div');
            tile.className = 'letter-tile';
            row.appendChild(tile);
        }
        board.appendChild(row);
    }

    resetKeyboard();
    updateCurrentRowInput();
    setupKeyboardListener();
    setupKeyboardClickListeners();
}

function resetKeyboard() {
    document.querySelectorAll('.key:not(.key-action)').forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
    });
}

function setupKeyboardClickListeners() {
    document.querySelectorAll('.key:not(.key-action)').forEach(key => {
        key.onclick = () => {
            const letter = key.textContent;
            handleKeyPress({ key: letter, preventDefault: () => {} });
        };
    });
}

function updateCurrentRowInput() {
    const rowIndex = gameState.guesses.length;
    if (rowIndex >= gameState.maxGuesses) return;

    console.log('[UPDATE-CURRENT-ROW] rowIndex:', rowIndex, 'currentInput:', gameState.currentInput, 'firstLetter:', gameState.firstLetter);

    const row = document.getElementById('game-board').children[rowIndex];

    for (let i = 0; i < gameState.wordLength; i++) {
        const tile = row.children[i];
        tile.classList.remove('typing', 'correct', 'prefilled');

        if (i < gameState.currentInput.length) {
            tile.textContent = gameState.currentInput[i];
            if (i === 0) {
                tile.classList.add('correct', 'prefilled');
            } else {
                tile.classList.add('typing');
            }
        } else {
            tile.textContent = '';
        }
    }
}

function setupKeyboardListener() {
    document.addEventListener('keydown', handleKeyPress);
}

function handleKeyPress(e) {
    if (currentScreen !== 'game-screen') {
        return;
    }

    if (gameState.guesses.length >= gameState.maxGuesses) {
        return;
    }

    if (e.key === 'Enter') {
        submitGuess();
    } else if (e.key === 'Backspace') {
        e.preventDefault();

        if (gameState.currentInput.length > 0) {
            let newInput = gameState.currentInput.slice(0, -1);

            if (newInput.length === 0 && gameState.firstLetter) {
                newInput = gameState.firstLetter;
            }

            gameState.currentInput = newInput;
            updateCurrentRowInput();
        }
    } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();

        if (gameState.currentInput.length < gameState.wordLength) {
            gameState.currentInput += e.key.toUpperCase();
            updateCurrentRowInput();
        }
    }
}

function extractUserInput() {
    let userInput = '';
    for (let i = 0; i < gameState.currentInput.length; i++) {
        if (!gameState.correctLetters[i]) {
            userInput += gameState.currentInput[i];
        }
    }
    return userInput;
}

function countNonPrefilledPositions() {
    let count = 0;
    for (let i = 0; i < gameState.wordLength; i++) {
        if (!gameState.correctLetters[i]) {
            count++;
        }
    }
    return count;
}

function buildInputWithPrefilled(userInput) {
    let result = '';
    let userInputIndex = 0;

    for (let i = 0; i < gameState.wordLength; i++) {
        if (gameState.correctLetters[i]) {
            result += gameState.correctLetters[i];
        } else if (userInputIndex < userInput.length) {
            result += userInput[userInputIndex];
            userInputIndex++;
        }
    }

    return result;
}

async function submitGuess() {
    const guess = gameState.currentInput.toUpperCase();

    if (guess.length !== gameState.wordLength) {
        showMessage(`Le mot doit contenir ${gameState.wordLength} lettres`, 'error');
        return;
    }

    if (gameState.mode === 'multiplayer') {
        socket.emit('submit-guess', {
            sessionId: gameState.sessionId,
            guess: guess
        });
        // Don't reset currentInput here - wait for guess-result event
    } else {
        try {
            const response = await fetch('/api/check-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: gameState.mode === 'word-of-the-day' ? 'DAILY' : gameState.soloSessionId,
                    guess: guess
                })
            });

            const data = await response.json();

            if (!data.valid) {
                showMessage(data.message, 'error');
                gameState.currentInput = gameState.firstLetter;
                updateCurrentRowInput();
                return;
            }

            displayGuess(data.result);
            gameState.guesses.push(data.result);
            gameState.currentInput = '';

            const isCorrect = data.result.every(r => r.status === 'correct');

            if (isCorrect) {
                setTimeout(() => showWinScreen(), 1000);
            } else if (gameState.guesses.length >= gameState.maxGuesses) {
                setTimeout(() => showLoseScreen(), 1000);
            }
        } catch (error) {
            showMessage('Erreur lors de la vérification du mot', 'error');
        }
    }
}

function displayGuess(result) {
    const rowIndex = gameState.guesses.length;
    const row = document.getElementById('game-board').children[rowIndex];

    // Store the current word number to check if we've moved to a new word
    const currentWordNumber = gameState.currentWordNumber;
    console.log('[DISPLAY-GUESS] rowIndex:', rowIndex, 'currentWordNumber:', currentWordNumber, 'currentInput before:', gameState.currentInput);

    result.forEach((letterData, index) => {
        const tile = row.children[index];
        tile.textContent = letterData.letter;
        tile.classList.remove('prefilled', 'typing');
        setTimeout(() => {
            tile.classList.add(letterData.status);
        }, index * 100);

        if (letterData.status === 'correct') {
            gameState.correctLetters[index] = letterData.letter;
        }

        updateLetterStatus(letterData.letter, letterData.status);
    });

    document.getElementById('attempt-count').textContent = (rowIndex + 1).toString();

    setTimeout(() => {
        console.log('[DISPLAY-GUESS-DELAYED] Checking - stored word:', currentWordNumber, 'current word:', gameState.currentWordNumber, 'currentInput:', gameState.currentInput);
        // Only update if we're still on the same word
        if (gameState.currentWordNumber === currentWordNumber) {
            console.log('[DISPLAY-GUESS-DELAYED] Same word - updating display');
            updatePreviousRows();
            updateKeyboardDisplay();
            updateCurrentRowInput();
        } else {
            console.log('[DISPLAY-GUESS-DELAYED] Different word - skipping update');
        }
    }, result.length * 100 + 200);
}

function updateLetterStatus(letter, status) {
    const currentStatus = gameState.letterStatus[letter];

    if (status === 'correct') {
        gameState.letterStatus[letter] = 'correct';
    } else if (status === 'present' && currentStatus !== 'correct') {
        gameState.letterStatus[letter] = 'present';
    } else if (status === 'absent' && !currentStatus) {
        gameState.letterStatus[letter] = 'absent';
    }
}

function updateKeyboardDisplay() {
    document.querySelectorAll('.key:not(.key-action)').forEach(key => {
        const letter = key.textContent;
        const status = gameState.letterStatus[letter];

        if (status) {
            key.classList.remove('correct', 'present', 'absent');
            key.classList.add(status);
        }
    });
}

function updatePreviousRows() {
    for (let rowIdx = 0; rowIdx < gameState.guesses.length; rowIdx++) {
        const row = document.getElementById('game-board').children[rowIdx];
        const guess = gameState.guesses[rowIdx];

        guess.forEach((letterData, index) => {
            if (gameState.correctLetters[index] === letterData.letter) {
                const tile = row.children[index];
                tile.classList.remove('present', 'absent');
                if (!tile.classList.contains('correct')) {
                    tile.classList.add('correct');
                }
            }
        });
    }
}

function handleKeyboardEnter() {
    submitGuess();
}

function handleKeyboardBackspace() {
    handleKeyPress({ key: 'Backspace', preventDefault: () => {} });
}

function showWinScreen() {
    if (gameState.mode === 'solo') {
        gameState.soloScore++;
        document.getElementById('game-mode').textContent = `🎮 Solo - Score: ${gameState.soloScore}`;
        showMessage('🎉 Mot trouvé! Mot suivant...', 'success');
        setTimeout(() => {
            loadNextSoloWord();
        }, 1500);
    } else {
        showScreen('result-screen');
        document.getElementById('result-title').textContent = '🎉 Félicitations!';
        document.getElementById('result-stats').innerHTML = `
            Vous avez trouvé le mot en <strong>${gameState.guesses.length}</strong> essai${gameState.guesses.length > 1 ? 's' : ''}!
        `;
        updateResultButtons();
    }
}

function showLoseScreen() {
    if (gameState.mode === 'solo') {
        showScreen('result-screen');
        document.getElementById('result-title').textContent = '😔 Partie Terminée!';
        document.getElementById('result-stats').innerHTML = `
            Score final: <strong>${gameState.soloScore}</strong> mot${gameState.soloScore > 1 ? 's' : ''} trouvé${gameState.soloScore > 1 ? 's' : ''}!
        `;
        updateResultButtons();
    } else {
        showScreen('result-screen');
        document.getElementById('result-title').textContent = '😔 Perdu!';
        document.getElementById('result-stats').innerHTML = `
            Vous n'avez pas trouvé le mot.<br>
            Réessayez!
        `;
        updateResultButtons();
    }
}

function updateResultButtons() {
    const playAgainBtn = document.querySelector('.result-buttons .btn-secondary');
    if (gameState.mode === 'word-of-the-day') {
        playAgainBtn.style.display = 'none';
    } else {
        playAgainBtn.style.display = 'inline-block';
    }
}

function quitGame() {
    if (confirm('Voulez-vous vraiment quitter la partie?')) {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        showMenu();
    }
}

function playAgain() {
    if (gameState.mode === 'word-of-the-day') {
        startWordOfTheDay();
    } else if (gameState.mode === 'solo') {
        showSoloConfig();
    } else {
        showMultiplayerLobby();
    }
}

function saveSessionToLocalStorage() {
    if (gameState.mode === 'multiplayer' && gameState.sessionId) {
        localStorage.setItem('claudus_session', JSON.stringify({
            sessionId: gameState.sessionId,
            pseudo: gameState.pseudo,
            timestamp: Date.now()
        }));
    }
}

function loadSessionFromLocalStorage() {
    const savedSession = localStorage.getItem('claudus_session');
    if (!savedSession) return null;

    const session = JSON.parse(savedSession);
    const oneHour = 60 * 60 * 1000;

    if (Date.now() - session.timestamp > oneHour) {
        localStorage.removeItem('claudus_session');
        return null;
    }

    return session;
}

function clearSessionFromLocalStorage() {
    localStorage.removeItem('claudus_session');
}

window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get('session');

    const savedSession = loadSessionFromLocalStorage();

    if (savedSession && !sessionIdFromUrl) {
        const reconnect = confirm(`Voulez-vous rejoindre votre session en cours (${savedSession.sessionId})?`);
        if (reconnect) {
            reconnectToSession(savedSession.sessionId, savedSession.pseudo);
        } else {
            clearSessionFromLocalStorage();
        }
    } else if (sessionIdFromUrl) {
        document.getElementById('session-id-input').value = sessionIdFromUrl;
        showMultiplayerLobby();
    }
});

function reconnectToSession(sessionId, pseudo) {
    gameState.pseudo = pseudo;
    gameState.sessionId = sessionId;
    gameState.mode = 'multiplayer';

    socket = io();

    setupMultiplayerSocketHandlers();

    socket.emit('reconnect-to-session', { sessionId, pseudo });
}

function showPostGameLobby(leaderboard) {
    showScreen('post-game-lobby-screen');
    displayLeaderboard(leaderboard);
    setupReplaySection(leaderboard);
}

function displayLeaderboard(leaderboard) {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';

    leaderboard.forEach((player, index) => {
        const rank = index + 1;
        const item = document.createElement('div');
        item.className = `leaderboard-item rank-${rank}`;

        let timeStr;
        let timeDisplay;

        // Check if player has finished (either completed or eliminated)
        const hasFinished = player.scores && player.scores.length > 0 &&
                           player.scores.some(s => s && (s.found || s.attempts >= 6));

        if (player.completionTime === null) {
            if (hasFinished) {
                // Player was eliminated (reached max attempts)
                timeStr = '❌ Éliminé';
                timeDisplay = `<span style="color: #f44336;">${timeStr}</span>`;
            } else {
                // Player is still playing
                timeStr = '⏳ En cours';
                timeDisplay = `<span style="color: #ff9800;">${timeStr}</span>`;
            }
        } else {
            const minutes = Math.floor(player.completionTime / 60000);
            const seconds = Math.floor((player.completionTime % 60000) / 1000);
            timeStr = minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;
            timeDisplay = timeStr;
        }

        const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

        item.innerHTML = `
            <div class="leaderboard-rank rank-${rank}">${rankEmoji}</div>
            <div class="leaderboard-info">
                <div class="leaderboard-name">${player.pseudo}</div>
                <div class="leaderboard-stats">
                    <div class="leaderboard-stat">
                        <span>Score:</span>
                        <strong>${player.totalScore}</strong>
                    </div>
                    <div class="leaderboard-stat">
                        <span>Temps:</span>
                        <strong>${timeDisplay}</strong>
                    </div>
                </div>
            </div>
        `;

        leaderboardDiv.appendChild(item);
    });
}

function setupReplaySection(leaderboard) {
    const selectorDiv = document.getElementById('player-replay-selector');
    selectorDiv.innerHTML = '';

    leaderboard.forEach((player, index) => {
        const btn = document.createElement('button');
        btn.className = 'replay-player-btn';
        if (index === 0) btn.classList.add('active');
        btn.textContent = player.pseudo;
        btn.onclick = () => showPlayerReplay(player, btn);
        selectorDiv.appendChild(btn);
    });

    // Show first player's replay by default
    if (leaderboard.length > 0) {
        showPlayerReplay(leaderboard[0], selectorDiv.children[0]);
    }
}

function showPlayerReplay(player, button) {
    // Update active button
    document.querySelectorAll('.replay-player-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    button.classList.add('active');

    // Display replay
    const viewerDiv = document.getElementById('replay-viewer');
    viewerDiv.innerHTML = '';

    if (player.scores.length === 0) {
        viewerDiv.innerHTML = '<p style="text-align: center; color: #999;">Aucune tentative enregistrée</p>';
        return;
    }

    player.scores.forEach((wordScore) => {
        const wordSection = document.createElement('div');
        wordSection.className = 'replay-word-section';

        const header = document.createElement('div');
        header.className = 'replay-word-header';

        const title = document.createElement('div');
        title.className = 'replay-word-title';
        title.textContent = `Mot ${wordScore.wordNumber}`;

        const result = document.createElement('div');
        result.className = `replay-word-result ${wordScore.found ? 'success' : 'failed'}`;
        result.textContent = wordScore.found ? `✓ Trouvé en ${wordScore.attempts} essais` : '✗ Non trouvé';

        header.appendChild(title);
        header.appendChild(result);
        wordSection.appendChild(header);

        const attemptsDiv = document.createElement('div');
        attemptsDiv.className = 'replay-attempts';

        wordScore.guesses.forEach((guessData) => {
            const row = document.createElement('div');
            row.className = 'replay-attempt-row';

            guessData.result.forEach((tile) => {
                const tileDiv = document.createElement('div');
                tileDiv.className = `replay-tile ${tile.status}`;
                tileDiv.textContent = tile.letter;
                row.appendChild(tileDiv);
            });

            attemptsDiv.appendChild(row);
        });

        wordSection.appendChild(attemptsDiv);
        viewerDiv.appendChild(wordSection);
    });
}

function returnToLobby() {
    if (!gameState.sessionId || !socket) {
        showMenu();
        return;
    }

    // Get current session info
    const sessionId = gameState.sessionId;
    const pseudo = gameState.pseudo;
    const isAdmin = gameState.isAdmin;

    // Reset game state but keep session info
    gameState.gameStarted = false;
    gameState.guesses = [];
    gameState.currentInput = '';
    gameState.letterStatus = {};

    // Set flag to force staying in lobby even if game is ongoing
    gameState.forceStayInLobby = true;

    // Request session state from server to get updated player list
    socket.emit('reconnect-to-session', { sessionId, pseudo });
}

