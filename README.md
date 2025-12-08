# Claudus - Word Guessing Game

A web-based word guessing game (similar to Wordle/Motus) built with Node.js, Express, and Socket.IO.

## Features

- **Word of the Day**: Everyone plays with the same word each day
- **Solo Mode**: Play with random words of customizable length (5-10 letters)
- **Multiplayer Mode**: Create or join game sessions with friends
- **Real-time Gameplay**: Live updates for multiplayer sessions
- **Share Links**: Easy session sharing with copy-to-clipboard functionality
- **Configurable Pseudo**: Set your username before playing

## Game Mechanics

- Guess the word in 6 attempts or less
- Green tile: Letter is correct and in the right position
- Orange tile: Letter exists but in wrong position
- Gray tile: Letter doesn't exist in the word
- First letter is always revealed

## Installation

1. Install dependencies:
```bash
npm install
```

2. Ensure you have a `words.txt` file in the root directory with one word per line.

## Running the Application

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## How to Play

### Word of the Day
1. Click "Mot du Jour" from the main menu
2. Try to guess today's word
3. Everyone gets the same word!

### Solo Mode
1. Click "Solo"
2. Enter your pseudo
3. Choose word length (5-10 letters)
4. Start guessing!

### Multiplayer Mode
1. Click "Multijoueur"
2. Enter your pseudo
3. Either:
   - **Create a session**: Choose word length and create
   - **Join a session**: Enter the session code
4. Share the session link with friends
5. Start playing when ready
6. See other players' progress in real-time

## Technologies Used

- Node.js
- Express.js
- Socket.IO (real-time multiplayer)
- Vanilla JavaScript (frontend)
- HTML5 & CSS3

## Project Structure

```
tusmo/
├── server.js           # Express server and game logic
├── words.txt           # Word dictionary
├── package.json        # Dependencies
├── public/
│   ├── index.html     # Main HTML file
│   ├── style.css      # Styling
│   └── game.js        # Client-side game logic
└── README.md
```
