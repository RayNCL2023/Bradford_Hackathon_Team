# AI Beat Studio

Tap out a beat on your keyboard. No music knowledge needed. An AI producer running **locally on Gemma 4** turns it into a catchy track with drums, bass and synths, gives it a name and a colour theme for the visuals, and suggests vocal clips made with **ElevenLabs**.

Built in one day at the Bradford Agentic AI Hackathon 2026. MIT licensed.

## Run it
```bash
npm install
cp .env.example .env     # then fill in the keys you have
npm start
```
No keys? It still runs in demo mode with a built-in backing track.

## How to play
- Pick a mood: **Chill, Dance, Hype or Dreamy**. It sets the speed and a scale, so every key sounds good.
- Tap **A–L** and **Q–P** (higher). **Z/X** shifts lower/higher.
- Press **Rec**, then **▶** (or Space), and tap a rhythm. You can also click the grid.
- Press **Make it a banger**.

## How it works
1. Your notes and a screenshot of the piano roll go to Gemma 4 (local through Ollama, Gemini API as backup).
2. Gemma replies with backing tracks **as notes** (not audio), a title, a colour palette, vocal ideas and timeline tips.
3. Tone.js plays everything in sync. ElevenLabs turns the vocal ideas into clips you can drop in.

## Project layout (one owner per folder; see AGENTS.md)
| Folder | What |
|---|---|
| `src/shell` | Main screen and wiring |
| `src/shared` | Data contracts and mock data |
| `src/pianoroll` | Piano roll and scale-locked keyboard |
| `src/visuals` | Beat-reactive visuals |
| `src/audio` | Tone.js audio engine |
| `src/ai` | Gemma producer (main process) |
| `src/voice` | ElevenLabs vocals and tips panel |
