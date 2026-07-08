> **Note (CT 106 copy):** this file describes the separate DMZ deployment's setup, not
> this checkout. CT 106 pushes to Gitea (`ak101/heathrow-demo.git`), not GitHub, and has
> none of the deploy keys described below. Kept here for reference only — see RESTORE.md.

# GitHub access from this box (dmzserver)

This box sits in a DMZ: outbound internet works (can reach github.com), but there's
no LAN access (can't reach internal servers like the old Gitea instance). It's also
both the dev machine and the demo server — code is edited, built, and deployed
right here, and GitHub is used purely as an off-site backup. There is no CI/CD
pipeline; deploys are the manual `docker compose build && docker compose up -d`
step run locally after each change.

## Pattern: one SSH deploy key per repo

Each repo gets its own dedicated ed25519 keypair, added to *that repo only* as a
GitHub deploy key (Settings → Deploy keys). This was chosen over a single
account-wide SSH key so that if this box's key material were ever compromised,
only one repo's access is affected, not the whole GitHub account.

### Steps for a new repo (e.g. `some-new-demo`)

1. Generate a dedicated keypair:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/some-new-demo-deploy -N "" -C "some-new-demo-deploy@dmzserver"
   ```

2. Copy the public key (`cat ~/.ssh/some-new-demo-deploy.pub`) and add it at
   `https://github.com/<owner>/some-new-demo/settings/keys` → **Add deploy key**
   → check **"Allow write access"**.

3. Add a host alias to `~/.ssh/config` so SSH knows which key to present for this repo:
   ```
   Host github.com-some-new-demo
     HostName github.com
     User git
     IdentityFile ~/.ssh/some-new-demo-deploy
     IdentitiesOnly yes
   ```

4. Clone/set the remote using that alias instead of `github.com`:
   ```bash
   git remote add origin git@github.com-some-new-demo:<owner>/some-new-demo.git
   # or, for a fresh clone:
   git clone git@github.com-some-new-demo:<owner>/some-new-demo.git
   ```

5. Test before relying on it: `ssh -T git@github.com-some-new-demo` should reply
   "You've successfully authenticated, but GitHub does not provide shell access."
   (exit code 1 there is normal, not a failure).

## This repo's setup

- Deploy key: `~/.ssh/heathrow-demo-deploy`
- SSH config alias: `github.com-heathrow-demo`
- Remote: `git@github.com-heathrow-demo:ak085/heathrow-demo-github.git`

## History note

This repo briefly used HTTPS + a GitHub Personal Access Token stored in
`~/.git-credentials` before switching to the SSH deploy key above. That token
has been revoked and the credential file removed — SSH deploy keys are the
standing method going forward.
