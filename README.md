# Jobbie — Automated Job Application Assistant

An intelligent job application automation tool that applies to jobs on **Naukri.com** and **Indeed.com** automatically using configurable search filters, duplicate prevention, and real-time progress tracking.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TailwindCSS v3 + Lucide React + Recharts |
| Backend | Node.js + Express + Socket.io |
| Database | MongoDB Atlas |
| Automation | Puppeteer + puppeteer-extra-plugin-stealth |
| Security | AES-256 encryption, bcrypt, JWT |

---

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB Atlas account (or local MongoDB)

---

## Setup Instructions

### 1. Clone and Configure

```bash
git clone <repo>
cd Jobbie
```

### 2. Environment Variables

The `.env` file is already configured at the root. To customise:

```env
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
ENCRYPTION_KEY=...    # Must be exactly 32 characters
CLIENT_URL=http://localhost:5173
```

### 3. Install Dependencies

```bash
# Server dependencies
cd server && npm install && cd ..

# Client dependencies
cd client && npm install && cd ..

# Root dev dependency (concurrently)
npm install
```

### 4. Start Development Servers

```bash
npm run dev
```

The application will start:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

---

## 📖 How to Use Jobbie (User Guide)

To prevent confusion and ensure the automation runs flawlessly, follow these steps in order.

### Step 1: Create an Account
1. Open the application.
2. Click **Sign Up** to create a Jobbie account.
3. You will be redirected to the Dashboard.

### Step 2: Upload Your Resume
1. Navigate to the **Resumes** tab in the sidebar.
2. Click **Upload Resume** and select your PDF resume.
3. This resume will be automatically injected when applying for jobs on LinkedIn or Indeed.

### Step 3: Add Your Credentials & Cookies (Crucial Step)
Because Jobbie automates real job boards (Naukri, Indeed, LinkedIn), these platforms have strict anti-bot security. If you just enter your password, the cloud server will likely get blocked. 

**The ultimate way to bypass this is by using Session Cookies.**

1. Go to the **Credentials** tab.
2. Select the platform (e.g., Naukri).
3. Open a new tab in your normal Chrome browser and log into Naukri manually.
4. Install a free Chrome Extension like **[EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg)** or **Cookie-Editor**.
5. Click the extension icon on the Naukri page and choose **Export**. (This copies your cookies as a huge JSON text block to your clipboard).
6. Go back to Jobbie, paste that huge block of text into the **Session Cookies** text box.
7. Click **Save**.

*By injecting your cookies, Jobbie completely bypasses the login screen, OTPs, and Cloudflare CAPTCHAs!*

### Step 4: Run Automation
1. Navigate to the **Automate** tab.
2. Select your Target Platform (e.g., Naukri).
3. Select your saved Credential.
4. Select your uploaded Resume.
5. Enter your search filters (Keywords, Location, Experience).
6. Click **Start Automation**.

### Step 5: Watch the Live Console
Once started, the **Live Console** will appear. It connects via WebSockets to show you exactly what the bot is doing in real-time.
- If it says `Sanitizing and injecting session cookies...`, you successfully bypassed the login!
- It will show you every job it finds, skips (if duplicate), and applies to.
- You can stop the automation at any time by clicking the Stop button.

---

## Application Flow

```
1. Register/Login (JWT auth)
         │
2. Add Platform Credentials (Naukri/Indeed)
   → Passwords encrypted with AES-256 before DB storage
         │
3. Upload Resume (PDF, max 5MB)
         │
4. Configure Search:
   → Keywords, Location, Experience, Job Type, Max Applications
         │
5. Start Automation Session
   → Puppeteer (stealth mode) logs into platform
   → Searches jobs with configured filters
   → For each job:
       ├─ Check duplicate (URL match in DB) → skip if duplicate
       ├─ Click Apply / Easy Apply button
       ├─ Upload resume if prompted
       ├─ Submit application
       ├─ Log result (applied/skipped/failed/duplicate)
       └─ Wait random delay (3–6s) to simulate human behavior
   → Retry failed jobs up to 3 times (exponential backoff)
         │
6. Monitor via Live Console (Socket.io real-time updates)
         │
7. Review Logs → filter by platform/status, export CSV
```

---

## Features

| Feature | Details |
|---------|---------|
| **Authentication** | Register/Login with JWT, secure bcrypt hashing |
| **Platform Support** | Naukri.com + Indeed.com |
| **Job Search Filters** | Keywords, location, experience level, job type (remote/hybrid/onsite) |
| **Easy Apply** | Auto-detects and clicks Easy Apply / Quick Apply buttons |
| **Resume Upload** | PDF upload with drag-and-drop, 5MB limit |
| **Duplicate Prevention** | Checks job URL against DB before applying |
| **Retry Mechanism** | Up to 3 retries per job with exponential backoff |
| **Real-time Console** | Socket.io streams live logs to dashboard |
| **Progress Tracking** | Live progress bar showing applied count |
| **Application Logs** | Full history with status, company, job URL |
| **CSV Export** | Export logs as CSV for analysis |
| **Credential Security** | AES-256-CBC encrypted platform passwords |
| **Bot Stealth** | puppeteer-extra-plugin-stealth bypasses detection |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

### Credentials
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/credentials` | Save platform credentials |
| GET | `/api/credentials` | List credentials (no passwords) |
| DELETE | `/api/credentials/:id` | Delete credential |

### Resume
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resume/upload` | Upload PDF resume |
| GET | `/api/resume` | List resumes |
| PATCH | `/api/resume/:id/default` | Set default resume |
| DELETE | `/api/resume/:id` | Delete resume |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/automation/start` | Start session |
| POST | `/api/automation/stop/:id` | Stop session |
| GET | `/api/automation/status` | Running session status |
| GET | `/api/automation/sessions` | Session history |

### Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/logs` | Get logs (paginated, filterable) |
| GET | `/api/logs/stats` | Aggregated stats + 7-day trend |
| DELETE | `/api/logs/:id` | Delete a log entry |
| DELETE | `/api/logs` | Clear all logs |

---

## Socket.io Events

| Event | Payload | Description |
|-------|---------|-------------|
| `automation:started` | `{ platform, keywords }` | Session started |
| `automation:log` | `{ message, type }` | Console log message |
| `automation:applying` | `{ jobTitle, company }` | Currently applying |
| `automation:applied` | `{ jobTitle, company, appliedCount }` | Successfully applied |
| `automation:completed` | `{ stats }` | Session ended |
| `automation:error` | `{ message }` | Error occurred |

---

## Notes on Bot Detection

Naukri and Indeed use bot detection. The automation uses:
- **puppeteer-extra-plugin-stealth** to remove Puppeteer fingerprints
- **Random delays** (1.5–6 seconds) between actions
- **Human-like typing** with per-character delays
- **Proper browser headers** (Accept-Language, etc.)

Some CAPTCHAs may still appear — these are logged as errors and the session moves to the next job.

---

## Project Structure

```
Jobbie/
├── .env                     ← All secrets (gitignored)
├── .env.example             ← Template for env vars
├── package.json             ← Root workspace config
├── client/                  ← React frontend
│   ├── src/
│   │   ├── api/             ← Axios instance
│   │   ├── components/      ← Sidebar, LiveConsole, StatCard, ProtectedRoute
│   │   ├── context/         ← AuthContext
│   │   └── pages/           ← Dashboard, Automate, Credentials, Resume, Logs
│   └── tailwind.config.js
└── server/                  ← Node.js backend
    ├── index.js             ← Express + Socket.io entry
    ├── models/              ← Mongoose schemas
    ├── controllers/         ← Business logic
    ├── routes/              ← API routes
    ├── middleware/          ← JWT auth, error handler
    ├── automation/
    │   ├── queue.js         ← Session manager
    │   └── platforms/       ← Naukri.js, Indeed.js
    ├── utils/               ← encryption, logger
    ├── uploads/             ← Stored resumes
    └── logs/                ← Winston log files
```
