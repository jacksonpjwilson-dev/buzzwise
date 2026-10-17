# Buzzwise — party game shows on everyone's phone

Three modes in one app: **Jeopardy** (trivia), **Wheel of Fortune** (puzzles) and **Family Feud** (team surveys). Pick one on the home page.


Host on a laptop/TV, players buzz in from their phones. 15 boards (2 Easy, 9 Medium, 2 Hard, 2 Expert), each with two 6×5 rounds plus Final — 915 clues, none repeated.

## Run it

You need **Node.js** (free, LTS version): https://nodejs.org

**Mac**
1. Unzip the folder, open **Terminal**, type `cd ` (with a space), drag the `jeopardy-pro` folder into the window, press Enter.
2. Run `npm install` (first time only).
3. Run `node server.js`

**Windows**
1. Unzip the folder, open it, click the address bar, type `cmd`, press Enter.
2. Run `npm install` (first time only).
3. Run `node server.js`

Then open **http://localhost:3000** on the host computer and choose **Host** under the game you want.
Players on the same Wi-Fi open the `http://192.168.x.x:3000/play` address printed in the terminal and enter the 5-letter code.

## Friends on other Wi-Fi
Leave the server running, open a second terminal window and run:

```
npx --yes cloudflared tunnel --url http://localhost:3000
```

It prints a `https://something.trycloudflare.com` link. Send friends that link + `/play`.

## Put it online (one permanent link)
See **[DEPLOY.md](DEPLOY.md)**: GitHub, then Render's free web service. Anyone can then open `https://your-name.onrender.com` with no computer to keep running. The server reads `PORT`, listens on `0.0.0.0`, and WebSockets work over https (wss) automatically.

## Who is hosting? (every game)
At the top of each host screen pick:
- **🎙️ Dedicated host**: a non-player runs the game. Their screen shows the answers (Jeopardy clue + answer, Wheel puzzle answer, the full Feud survey board, Price Is Right prices).
- **🎮 Player host / no official host**: everyone plays and nobody sees answers early.
  - **Jeopardy:** the clue text is hidden from every screen. The host screen **reads it aloud** (browser speech), and buzzers are open while it reads: a buzz mid-read stops the voice. If that answer is Wrong, the clue is read again from the start (others can buzz mid-read again). The clue text appears on the shared screen only after one complete, uninterrupted reading, then stays up for that clue. The player who buzzes says their answer out loud, then the host player presses **🔒 Reveal answer** on the shared screen. That sends the correct response **only to the buzzing player's phone** (the shared screen and other phones stay hidden, since the host is a contestant too, and players can't reveal it to themselves), and they tap **✓ Correct** or **✗ Wrong** themselves. Wrong: they lose the value, the answer stays hidden, and buzzers reopen for everyone else. Correct: they get the points and the answer appears on the big screen so everyone can check. If nobody gets it, or nobody buzzes within 12 seconds, the answer appears on the big screen. The setup screen has a **🔊 Read-aloud voice** picker (most natural voices, e.g. Microsoft "Online (Natural)", Google US English, Samantha/Ava/Zoe, are ranked first, marked ★) with a **Test voice** button; the choice is remembered on that device. Buttons: **🔒 Reveal answer**, **🔁 Repeat clue**, **Finish reading**, **No one got it · Reveal**, **Continue**.
  - **Family Feud:** the host player can join a team right on the host screen (**🎮 Play too?** → name + Join team), then take face-offs (**🔔 I buzzed**), type guesses and count for their team while still running the board. They can also join from a phone at `/ff/play`. The host screen never shows survey answers in this mode.
  - **Family Feud / Price Is Right / Wheel:** answers and prices stay hidden from the host screen until they're revealed. Feud guesses are typed on phones and judged automatically.

## How to play
- Host picks a difficulty and board, waits for players, then clicks **Start game**.
- Click a square: only the host sees the clue and answer; read it aloud. Buzzers go live instantly.
- First buzz locks everyone else out. ✓ Correct awards the value; ✗ Incorrect deducts it and reopens buzzers for the others.
- Daily Doubles (1 in round 1, 2 in Double Jeopardy) go to the player in control, who wagers on their phone.
- Final Jeopardy: secret wagers and typed answers on phones; the host judges each one.
- Use the ± button on the scoreboard to fix any score.

## Wheel of Fortune
- Host opens **/wof** on the TV; 2-4 players join at **/wof/play** with the code.
- **Next Puzzle** starts a regular round. On your turn your phone shows **Spin**, **Vowel $250** and **Solve**. After spinning, tap a consonant (used letters are greyed out). Each letter found earns its count × the wedge value. A miss, Bankrupt or Lose a Turn passes play to the next player. Free Play lets you call any letter with no penalty.
- Whoever solves banks their round money (at least $1,000) into their total. Everyone else's round money is lost.
- **Toss-Up**: tiles reveal on their own; the first to buzz types the answer (+$1,000, and they start the next round).
- **Bonus Round**: the leader gets R S T L N E, picks 3 consonants + 1 vowel, then has 10 seconds to solve. The host judges ($25,000).
- Host tools: Skip turn, Award puzzle / Accept last guess, ± fix scores. The host screen shows the answer; phones never get it until it's solved.
- Puzzles live in `data/wof-puzzles.txt` (172 puzzles). Run `npm run check:wof` after editing.

## Family Feud
- Host opens **/ff** on the TV. Players join at **/ff/play**, pick Team 1 or Team 2.
- **The host doesn't know the answers and can play too.** The TV only shows numbered hidden slots. Answers are revealed only when someone guesses them; the server never sends hidden answers to any screen.
- Answers can be typed by the host (whatever a player says out loud) or by players on their phones. Matching works like a human host would: it ignores capitals and punctuation, handles plurals and verb forms ("brushing my teeth" = Brush Teeth), forgives typos ("sunscrean"), and knows synonyms from a built-in map (`data/ff-synonyms.json`) plus per-answer alias lists (`data/ff-aliases.json`, regenerate with `npm run gen:ff`).
- **Face-off:** the two face-off players buzz on their phones. The higher-ranked answer wins; that team chooses Play or Pass.
- The team in control keeps guessing. Each miss is a strike (big ✕ + buzzer sound). After 3 strikes, the other team gets one guess to steal the points.
- Rounds 3 = double points, 4+ = triple. First team to 300 (or after the max rounds, default 5) wins.
- **Override: this should have counted** — if a fair answer was rejected, confirm and the closest matching answer is revealed (nothing is shown before you confirm).
- **Fast Money:** two players from the winning team, 5 questions, 20 and 25 seconds, answers typed on the phone (or by the host). Repeating player 1's answer = "try again". 200 points wins.
- Host tools: Skip round, ± team scores, team names, max rounds, New game.
- Surveys live in `data/ff-surveys.txt` (114 questions). **The survey answers and point values are made-up estimates written for this game, not results of real surveys.** Run `npm run check:ff` after editing.

## For developers
- Questions live in `data/boards/*.txt` (easy to edit). After editing run `npm run check` — rebuilds `data/questions.json` and verifies no duplicate clues/answers across all boards.
- `npm test` runs automated full-game tests for both modes (needs `npm install` incl. dev deps).

## The Price Is Right mode (`/pir` host screen, `/pir/play` phones)

- **Contestants' Row** – 4 players bid secretly (or sequentially with visible bids, host toggle). Closest without going over wins; an exact bid earns a $500 bonus. If everyone overbids, the host triggers a re-bid. Duplicate bids are rejected.
- **Pricing games** – Any Number-ish (find the prize's digits), Higher/Lower, Cliff Climber (Cliffhangers-style, fall after 25 steps of error), Clock Game (30 s, automatic HIGHER/LOWER), Plinko-lite (earn chips, animated drop into $100–$10,000 slots).
- **Showcase Showdown** – top 3 by winnings spin a 5¢–$1.00 wheel once or twice; over $1.00 is out; exactly $1.00 pays a $1,000 bonus; ties spin off.
- **Final Showcase** – top 2 bid secretly; closest without going over wins, within $250 wins both showcases.
- The host screen **never shows a price before its reveal**, so the host can play too. The server only includes prices in state after the reveal (verified by `scripts/test-pir.js`).
- **Product library**: 179 unique products in `data/pir-products.txt`. **All prices are rough made-up US retail estimates, not real or current prices** (also shown as a footnote in the UI). `npm run check:pir` validates count, duplicates and prices.
