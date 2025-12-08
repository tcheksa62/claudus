# Testing Multiplayer Mode

## How to Test with Browser Console

1. **Open first browser window**:
   - Go to `http://localhost:3000`
   - Open Developer Console (F12) → Console tab
   - Create a multiplayer session with pseudo "Player1"
   - Note the session code

2. **Open second browser window** (incognito or different browser):
   - Go to `http://localhost:3000`
   - Open Developer Console (F12) → Console tab
   - Join the session with the code from step 1
   - Use pseudo "Player2"

3. **Start the game** (as Player1 - admin):
   - Click "Démarrer la partie" button
   - **Watch BOTH console windows** for these logs:

### Expected Console Logs:

**Player 1 (Admin) Console:**
```
[START-GAME] Button clicked
[START-GAME] isAdmin: true
[START-GAME] gameStarted: false
[START-GAME] sessionId: XXXXXX
[START-GAME] socket exists: true
[START-GAME] socket connected: true
[START-GAME] Button disabled
[START-GAME] Emitting start-game event...
[START-GAME] Event emitted
[GAME-STARTED] Event received: {wordLength: 6, firstLetter: "X", wordNumber: 1, totalWords: 1}
[GAME-STARTED] Current players: [{...}]
[GAME-STARTED] Calling initializeGameBoard...
[GAME-STARTED] initializeGameBoard completed
[GAME-STARTED] Calling showScreen...
[GAME-STARTED] showScreen completed
[GAME-STARTED] Setting live view display...
[GAME-STARTED] Live view displayed
[GAME-STARTED] Calling initializeLiveView...
[GAME-STARTED] All setup complete!
```

**Player 2 Console:**
```
[GAME-STARTED] Event received: {wordLength: 6, firstLetter: "X", wordNumber: 1, totalWords: 1}
[GAME-STARTED] Current players: [{...}]
... (same as Player 1)
```

## Server Logs to Check

In the terminal where `node server.js` is running, you should see:
```
Game started in session XXXXXX
```

## Troubleshooting

If you see the button grayed out but NO logs:
- The button click is not being triggered
- Check if there's a JavaScript error before the click

If you see "[START-GAME] Event emitted" but NO "[GAME-STARTED]":
- The server is not sending the event back
- Check server logs
- Check if socket is connected

If you see an ERROR in the console:
- Share the full error message
