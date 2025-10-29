# Inline Translate (on-page bubble) - Chrome Built-in AI

Select text on any web page and get a small translation bubble right next to your selection.  

Runs on-device with Chrome Built-in AI Translator after a one-time local model download. 

No text leaves your machine. Works offline on supported devices. Includes a local dev fallback for demos.

Repo: https://github.com/WINEEL/chrome-inline-translate


## Table of contents

- [The story](#the-story)
- [What it does](#what-it-does)
- [Language coverage](#language-coverage)
- [How it uses Chrome Built-in AI](#how-it-uses-chrome-built-in-ai)
- [Privacy](#privacy)
- [Requirements and compatibility](#requirements-and-compatibility)
- [Install (developer mode)](#install-developer-mode)
- [Usage](#usage)
- [Controls and settings](#controls-and-settings)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Code overview](#code-overview)
- [Submission checklist (Devpost)](#submission-checklist-devpost)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgements](#acknowledgements)


## The story

I grew up reading the internet like many people who learn in a language that is not their first. When a paragraph felt heavy, I copied it, opened a new tab, pasted it into Google Translate, picked the languages, then read the output. I did that loop hundreds of times. It worked, but it always took me out of the flow. The learning stopped for half a minute while I wrestled with tabs.

Years later I moved to the U.S. and noticed something that clicked for me. Several Chinese friends who are fluent in English still prefer Chinese LeetCode. I asked why. The answer was simple. Even when you know a second language well, your brain processes your first language with less effort. Ideas land faster. Hard problems feel a little lighter. I knew that feeling from my own study sessions with Wikipedia and research blogs. The barrier is not the content. The barrier is the friction between your eyes and your understanding.

That is the seed of this project. Remove the copy and paste dance. Keep your eyes on the page. Let the translation appear right where your cursor already is. This is not only about English. The bubble can translate between many languages and scripts, so the same seamless flow helps readers everywhere.

The real spark came at Google’s #WebAI Summit. I learned that Chrome has a Built-in AI stack, including an on-device Translator API and Language Detector. After a one-time local model download, translation runs fully on-device. That matters. If translation happens on your machine, your text does not leave your machine. Privacy improves. Latency improves. Cost becomes zero. The hackathon was already running when I learned this, so I started late, but the fit was perfect. The tool I had wished for as a student finally had a native engine.

### What I wanted the experience to feel like

Reading should not be interrupted by a big UI. It should feel like a whisper. So the core interaction is simple.

1. You select text.  
2. You pause for a beat.  
3. A small bubble appears near the selection with a translation you can read without moving your eyes.

The bubble shows the detected source language and a confidence score, which helps you trust what you are seeing. There are four clear actions: **Swap, Copy, Replace, and Close**. A small gear opens settings in place. No new tabs. No getting lost.

Behind that quiet surface are a handful of choices that came from real moments of frustration during development.

- Some sites block selection. A per-site **Force Selectable** option fixes that without pushing global styles on every page.  
- People often read the same site in the same target language. The extension **remembers your target per site**.  
- The bubble **stays put when you open settings**. It locks itself until you close the panel. You do not lose your place.  
- The bubble **hides itself** as soon as your selection goes away or you press **Esc**. No leftover UI hovering over other tasks.

### Why on-device

I could have called a cloud translation service in a few lines of code. I decided not to. On-device translation fits the values I want for tools that live inside a browser.

- Your text does not leave the page. Better for privacy, especially on pages with personal data.  
- It works on airplanes and in quiet corners of libraries.  
- Latency is stable. No network, no surprise delays.

If the on-device API is not available on your machine, the extension shows a clear message. For demo purposes you can enable a small **local fallback** that produces readable but obviously non-production output. Judges can still try the flow on any laptop. Real users get the full benefit on supported devices.

### Small wins that made a big difference

- A short **idle delay** after selection prevents heavy work while you drag your cursor.  
- **Replace** uses the current selection or the last known range if the page reflows.  
- The **popup** gives you a global switch and a per-site pause.  
- The visual theme respects light and dark preferences and **softens the dark surface** to keep contrast comfortable.

### Who this helps

- Students who learn in English but think in another language when the topic becomes dense.  
- Researchers who skim multilingual sources and only need quick confirmations.  
- Developers who read error messages or docs in a second language and want a fast anchor in their first.  
- Anyone who wants understanding to be visible in place, not in another tab.

### The rough edges that taught me something

The first version tried to translate as I dragged. It felt fast in a demo and slow in real life. The fix was to wait until the selection stopped moving. Another early version let the settings panel flash and vanish when the selection changed. The fix was to lock the bubble and cancel any pending timers the moment the gear was touched. These sound small, but they changed the feeling from clever gadget to reliable tool.

### Why this project matters to me

I have spent a lot of time trying to understand hard things. Language friction should not add to that cost. A person’s first language is a ramp. If we can build small ramps, more people reach the same hilltop with less energy. A good ramp is quiet, local, and respectful of privacy. It also disappears when you do not need it. That is what I tried to build.

### What comes next

- **Smarter placement** that prefers white space and edges.  
- A **history view** in the popup for quick copy of recent translations.  
- Optional **phrase level highlighting** for language practice.  
- A small **API** so other extensions can request an inline translation bubble for their own selections.

This began as a personal itch. It is now a tool I keep on every page. If it lets someone stay in the flow for one more paragraph, it will have done its job.


## What it does

- Inline translation bubble appears near your selection after a short idle delay  
- **On-device** `Translator` API when available and **LanguageDetector** for Auto source  
- Shows detection with confidence, for example: `~detected: en(100%)`  
- **Swap / Copy / Replace / Close** actions  
- Draggable bubble, light theme and soft dark theme  
- **Inline settings** gear inside the bubble  
- **Per-site target language** memory  
- **Force Selectable** option for sites that block text selection  
- **Popup** with global **Enable everywhere** and **Pause on this site**  
- Keyboard: **Alt+Shift+T** re-translates the last selection  
- Context menu: right-click selection → Translate selection


## Language coverage

Inline Translate is language agnostic. It works across many language pairs supported by Chrome’s on-device Translator, not only English. Examples include English &lrarr; Telugu, Hindi, Tamil, Chinese, Spanish, French, German, Japanese, Korean, Arabic, Portuguese, Italian, Russian, and more. You can keep Source as Auto or choose a fixed source. Target is your choice and is remembered per site.

Note: exact language availability can vary by Chrome version and which local model bundle is installed on a given device.


## How it uses Chrome Built-in AI

**Primary path - on-device**  
- `Translator.create({ targetLanguage, sourceLanguage? })`  
  - If the model is not installed, Chrome handles a local download.  
  - After that one-time download, translation runs fully on-device and works offline.
- `LanguageDetector.create()` estimates the source language when Source is Auto.

**Dev fallback - for unsupported machines and demos**  
- A small local mock so the UX can be evaluated anywhere.  
- No cloud calls and no external translation services.


## Privacy

- Selected text is processed on-device after the model is installed.  
- The extension does not send your text to any server and does not collect analytics.  
- Chrome’s optional diagnostic telemetry, if the user has enabled it, is separate from this extension.


## Requirements and compatibility

- A Chrome build that exposes the Built-in AI Translator on your hardware  
- One-time local model download on first use  
- Works offline after the model is installed  
- If the API is unavailable, enable Dev fallback in settings to demo the flow

Check availability in DevTools Console:

```js
!!globalThis.Translator
await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'es' }) // 'readily' or 'downloadable'
```


## Install (developer mode)

1. Clone the repo
   ```bash
   git clone https://github.com/WINEEL/chrome-inline-translate.git
   cd chrome-inline-translate
   ```
2. Open `chrome://extensions` and turn on Developer mode.  
3. Click Load unpacked and select the project folder.  
4. Pin the extension if you want quick access.

If your device does not support the on-device API, the bubble shows a notice. You can enable Dev fallback in settings to demo the UX.


## Usage

1. Select text on any page.  
2. Pause briefly.  
3. Read the translation in the bubble near your selection.

Tips:
- Press **Alt+Shift+T** to re-translate the last selection.  
- Right-click any selection &rarr; Translate selection.  
- Use the popup to pause the extension on a site where you do not want the bubble.


## Controls and settings

**Bubble actions**  
- **Swap** - exchange source and target languages  
- **Copy** - copy the translated text  
- **Replace** - replace the original selection with the translation  
- **Close** - dismiss the bubble (Esc also works)

**Bubble settings (gear)**  
- **Source** - Auto or a fixed language  
- **Target** - remembered per site  
- **Dev fallback** - local mock for demo when Translator is unavailable  
- **Force selectable** - helps on sites that block selection

**Popup**  
- **Enable everywhere** - global on or off  
- **Pause on this site** - quick per-site control


## Troubleshooting

- **No bubble appears**  
  Ensure Enable everywhere is on and the site is not paused. Select more than one character. If the site blocks selection, turn on Force selectable.

- **Settings panel flashes or closes**  
  Fixed by locking the bubble and canceling pending timers. Reload the updated extension.

- **Replace does nothing**  
  Fixed by saving the last translation and range. Reload the updated extension.

- **On-device API not available**  
  Check availability as shown above. If it is downloadable, let Chrome install the model. If unsupported, enable Dev fallback.


## Project structure

Current tree:

```text
LICENCE
README.md
background.js
content.css
content.js
icons/
  icon128.png
manifest.json
options.html
options.js
popup.html
popup.js
translator.js
```


## Code overview

- **manifest.json** - permissions, content script, background worker, popup  
- **background.js** - defaults, context menu, keyboard command  
- **content.js** - selection detection, debounced bubble, translate call, inline settings, actions, per-site prefs  
- **content.css** - bubble layout, light and soft dark themes  
- **translator.js** - wrapper around `Translator` and `LanguageDetector`, progress events, dev fallback  
- **popup.html / popup.js** - global enable, per-site pause, quick language toggles  
- **options.html / options.js** - reserved for future advanced settings  
- **icons/** - extension icon  
- **LICENCE** - MIT License


## Submission checklist (Devpost)

- [x] Public GitHub repo with README and MIT License  
- [x] Short video or GIF that shows selection to bubble, detection confidence, in-bubble settings, popup toggles, on-device availability or offline after model download  
- [x] Clear description of how Chrome Built-in AI is used on-device  
- [x] Simple install and run instructions  
- [x] No external cloud translation in the primary path  
- [x] Credits and roles filled out on Devpost


## Roadmap

- Smarter bubble placement that prefers white space and screen edges  
- Translation history in the popup  
- Phrase level highlighting option  
- Domain pattern quick toggles  
- Small API for other extensions to request a bubble


## License

MIT. See [`LICENCE`](LICENCE) in the repo.


## Acknowledgements

Thanks to the Chrome team for the on-device Translator and Language Detector APIs, and to the organizers of the Google Chrome Built-in AI Challenge 2025.
