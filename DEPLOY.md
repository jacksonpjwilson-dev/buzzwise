# Put MyGameShow online: one link for everyone

When you're done, you'll have a permanent address like **https://buzzwise.onrender.com** that anyone can open on a phone or laptop. Nobody has to keep a computer running.
It's free and takes about 15 minutes. You don't need to know how to code.

---

## Part 1: Put the code on GitHub (about 5 minutes)

1. Go to **https://github.com** and create a free account (or sign in).
2. Click the **+** in the top-right corner, then **New repository**.
   - Repository name: `buzzwise`
   - Public or Private both work.
   - Leave every other box unticked, then click **Create repository**.
3. On the new empty repository page, click the link **"uploading an existing file"**.
4. Unzip `jeopardy-pro.zip` on your computer and open the `jeopardy-pro` folder.
   Select **everything inside it** (`server.js`, `package.json`, `render.yaml`, the `public`, `data` and `scripts` folders, etc.) and drag it all into the GitHub upload page.
   - Do **not** upload a `node_modules` folder if you have one. Render installs that itself.
5. Scroll down and click **Commit changes**. Wait until all the files show up in the list.

## Part 2: Create the website on Render (about 5 minutes)

1. Go to **https://render.com** and click **Get Started**. Choose **Sign in with GitHub**, which is the easiest option.
2. Click **New +** (top right), then **Web Service**.
3. Choose **Build and deploy from a Git repository**, then pick your `buzzwise` repository.
   If it isn't listed, click **Configure account** and give Render access to that repository.
4. Fill in the form:
   | Field | Value |
   |---|---|
   | Name | `buzzwise` (this becomes your web address) |
   | Region | the one closest to you |
   | Branch | `main` |
   | Runtime / Language | **Node** |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |
5. Click **Create Web Service** (or **Deploy**). Render shows a log. After 1–3 minutes it says **"Your service is live 🎉"**.
6. Your link is shown at the top of the page, e.g. `https://buzzwise.onrender.com`.

*(Shortcut: the project includes a `render.yaml` file, so you can also click **New + → Blueprint**, pick the repository, and click **Apply**. You get the same result with fewer fields.)*

## Part 3: Play

- **Host (TV or laptop):** open `https://YOUR-NAME.onrender.com`, choose a game, and click **Host**.
  At the top, choose **Dedicated host** or **Player host / no official host**.
- **Players (phones):** open `https://YOUR-NAME.onrender.com/play` (Feud: `/ff/play`, Wheel: `/wof/play`, Price: `/pir/play`) and type the 5-letter code.
- The link works from anywhere, on any Wi-Fi or mobile data. It's secure (https), and the live buzzers run over secure WebSockets automatically.
- For Jeopardy player-host mode, turn the TV or laptop **volume up**, because that screen reads the clues aloud.

## Good to know

- **The free tier sleeps.** If nobody has used the site for about 15 minutes, Render puts it to sleep. The next visitor waits **about 30 seconds** (sometimes up to a minute) while it wakes up. After that it's fast. Tip: open the host page a minute before game night starts.
- Games live in the server's memory, so a sleep or restart ends any game in progress. Just start a new one.
- **Updating:** upload changed files to the GitHub repository (**Add file → Upload files → Commit**). Render redeploys automatically within a couple of minutes.
- Want it to never sleep? Render's paid "Starter" plan (about $7/month) stays awake.

## Alternatives

- **Railway** (https://railway.app): **New Project → Deploy from GitHub repo → pick `buzzwise`**. It detects Node and runs `npm start`. Then go to **Settings → Networking → Generate Domain** to get your link. Railway has a small free trial or credit, then usage-based pricing. It doesn't sleep.
- **Fly.io** (https://fly.io): needs its command-line tool. Install `flyctl`, run `fly launch` in the project folder (accept the defaults and internal port 3000; the app reads `PORT` automatically), then `fly deploy`. Fly asks for a payment card, but small apps cost little or nothing.
- **Just for tonight, no account:** run it on your computer and use `npx --yes cloudflared tunnel --url http://localhost:3000` (see README). The link changes every time.
