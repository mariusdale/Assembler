# Credential Setup Guide

Assembler needs API tokens for three providers: GitHub, Neon, and Vercel. This guide walks through creating each one.

You can also run `assembler setup` for a guided interactive walkthrough that opens the right URLs and validates each token.

---

## 1. GitHub Personal Access Token

Assembler uses a GitHub token to create repositories and push your code.

### Steps

1. Go to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=Assembler)
2. Set a descriptive name (e.g., "Assembler")
3. Set expiration — **90 days** is recommended
4. Under "Select scopes", check **`repo`** (this grants access to create and push to repositories)
5. Click **Generate token**
6. **Copy the token immediately** — you won't be able to see it again

### Add to Assembler

```bash
assembler creds add github ghp_your_token_here
```

---

## 2. Neon API Key

Assembler uses a Neon API key to create Postgres database projects.

### Steps

1. Go to [https://console.neon.tech/app/settings/api-keys](https://console.neon.tech/app/settings/api-keys)
2. Click **Create API Key**
3. **Important**: This must be an **account-level key**, NOT a project-scoped key. Account-level keys can create new projects. Project-scoped keys can only manage a single existing project.
4. **Copy the key immediately** — you won't be able to see it again

### Add to Assembler

```bash
assembler creds add neon your_neon_api_key_here
```

---

## 3. Vercel API Token

Assembler uses a Vercel token to create projects, link repositories, set environment variables, and trigger deployments.

### Steps

1. Go to [https://vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Set a descriptive name (e.g., "Assembler")
4. Select **Full Account** scope
5. Click **Create**
6. **Copy the token immediately** — you won't be able to see it again

### Add to Assembler

```bash
assembler creds add vercel token=your_vercel_token_here
```

If you're on a Vercel team, include the team ID:

```bash
assembler creds add vercel token=your_token teamId=team_your_team_id
```

### Install the Vercel GitHub App

Assembler links your Vercel project to your GitHub repository. This requires the Vercel GitHub App to be installed on your GitHub account.

1. Go to [https://github.com/apps/vercel](https://github.com/apps/vercel)
2. Click **Install**
3. Choose your account or organization
4. Grant access to **All repositories** or select the specific repositories you'll use with Assembler

---

## Verify your credentials

After adding all three credentials, verify them:

```bash
assembler discover github
assembler discover neon
assembler discover vercel
```

Each should show `Connected: true` with your account name.

## Next steps

With credentials configured, deploy your project:

```bash
cd your-project
assembler launch
```
