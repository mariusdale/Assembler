# Credential Setup Guide

DevAssemble needs API tokens for three providers: GitHub, Neon, and Vercel. This guide walks through creating each one.

You can also run `devassemble setup` for a guided interactive walkthrough that opens the right URLs and validates each token.

---

## 1. GitHub Personal Access Token

DevAssemble uses a GitHub token to create repositories and push your code.

### Steps

1. Go to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new?scopes=repo&description=DevAssemble)
2. Set a descriptive name (e.g., "DevAssemble")
3. Set expiration — **90 days** is recommended
4. Under "Select scopes", check **`repo`** (this grants access to create and push to repositories)
5. Click **Generate token**
6. **Copy the token immediately** — you won't be able to see it again

### Add to DevAssemble

```bash
devassemble creds add github ghp_your_token_here
```

---

## 2. Neon API Key

DevAssemble uses a Neon API key to create Postgres database projects.

### Steps

1. Go to [https://console.neon.tech/app/settings/api-keys](https://console.neon.tech/app/settings/api-keys)
2. Click **Create API Key**
3. **Important**: This must be an **account-level key**, NOT a project-scoped key. Account-level keys can create new projects. Project-scoped keys can only manage a single existing project.
4. **Copy the key immediately** — you won't be able to see it again

### Add to DevAssemble

```bash
devassemble creds add neon your_neon_api_key_here
```

---

## 3. Vercel API Token

DevAssemble uses a Vercel token to create projects, link repositories, set environment variables, and trigger deployments.

### Steps

1. Go to [https://vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Set a descriptive name (e.g., "DevAssemble")
4. Select **Full Account** scope
5. Click **Create**
6. **Copy the token immediately** — you won't be able to see it again

### Add to DevAssemble

```bash
devassemble creds add vercel token=your_vercel_token_here
```

If you're on a Vercel team, include the team ID:

```bash
devassemble creds add vercel token=your_token teamId=team_your_team_id
```

### Install the Vercel GitHub App

DevAssemble links your Vercel project to your GitHub repository. This requires the Vercel GitHub App to be installed on your GitHub account.

1. Go to [https://github.com/apps/vercel](https://github.com/apps/vercel)
2. Click **Install**
3. Choose your account or organization
4. Grant access to **All repositories** or select the specific repositories you'll use with DevAssemble

---

## Verify your credentials

After adding all three credentials, verify them:

```bash
devassemble discover github
devassemble discover neon
devassemble discover vercel
```

Each should show `Connected: true` with your account name.

## Next steps

With credentials configured, deploy your project:

```bash
cd your-project
devassemble launch
```
