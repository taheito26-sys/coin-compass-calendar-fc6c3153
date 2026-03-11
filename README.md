# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)


## Backend API URL

Set this in your local environment (for example in `.env.local`):

```env
VITE_WORKER_API_URL=https://cryptotracker-api.taheito26.workers.dev
```

Important: the configured base URL must expose the expected API routes (for example `/api/status` and `/api/assets`).

For backend CORS, configure:

```env
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:8081,http://localhost:5173,https://tracker.pages.dev,https://cryptotracker-api.taheito26.workers.dev
```


### Clerk + Vite environment rules

Use only Vite-prefixed variables in this frontend:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

Do **not** use Next.js-style names like `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in this repo.

Do **not** expose `CLERK_SECRET_KEY` in this frontend (secret keys are backend-only).

If Clerk JS fails to load from a custom domain (CORS/404), force the official CDN URL:

```env
VITE_CLERK_JS_URL=https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js
```


## OpenCommit automation

This repository includes a GitHub Actions workflow (`.github/workflows/opencommit-automation.yml`) that uses OpenCommit to improve the latest commit message automatically on PR updates (and manually via `workflow_dispatch`).

### Required secret

Add this repository secret before enabling the workflow:

- `OCO_OPENAI_API_KEY`: OpenAI API key used by OpenCommit.

