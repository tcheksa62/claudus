# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claudus is a French word guessing game (similar to Wordle/Motus) with three game modes:
- **Word of the Day**: Same word for all players each day
- **Solo**: Random words with configurable length (5-10 letters)
- **Multiplayer**: Real-time sessions with multiple words per game

## Commands

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start server with auto-reload (development)
npm run dev
```

Server runs on `http://localhost:3000` by default (configurable via PORT env var).

## Architecture

### Backend (`server.js`)
- Express server with Socket.IO for real-time multiplayer
- Word dictionary loaded from `words.txt` (uppercase, 6-10 letters only)
- Session management via in-memory Maps (expire after 1 hour):
  - `multiplayerSessions`: Multiplayer game state, players, scores
  - `soloSessions`: Solo game words
- Word of the Day: Deterministic daily word based on date hash

### Frontend (`public/game.js`)
- Single-page app with screen-based navigation (`showScreen()`)
- Global `gameState` object tracks all game state
- Socket.IO client for multiplayer communication
- Session persistence via localStorage (auto-reconnect within 1 hour)

### Key Game Logic
- `checkGuess()`: Returns array of `{letter, status}` where status is 'correct', 'present', or 'absent'
- First letter always revealed at game start
- 6 max attempts per word
- Multiplayer: Each player progresses independently through words

### Test Mode
Admin pseudo "admin" uses fixed test words (SALADE, TOMATE) for predictable testing. Look for `TEST MODE` comments to remove for production.

## API Endpoints

- `GET /api/word-of-the-day` - Returns word length and first letter
- `GET /api/random-word?length=N` - Creates solo session, returns sessionId and word info
- `POST /api/check-word` - Validates guess against word (body: `{word, guess}`)
- `GET /api/debug/word-of-the-day` - Debug endpoint revealing actual word

## Socket Events (Multiplayer)

Key events: `create-session`, `join-session`, `start-game`, `submit-guess`, `game-started`, `guess-result`, `next-word`, `player-finished`, `game-completed`

## Docker

```bash
docker build -t claudus .
docker run -p 3000:3000 claudus
```
