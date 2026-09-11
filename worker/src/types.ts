export interface Env {
  // vars (wrangler.toml)
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  VAULT_DIR: string;
  // IANA zone the vault's date keys are in. Daily files are named for a local
  // calendar day, so this has to match whatever wrote them.
  TIMEZONE: string;
  // secrets (wrangler secret put)
  GITHUB_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  API_KEY: string;
}
