# Wind production runtime

`index-board` 的市场风格、资金流向、拥挤度和价值投资接口优先使用万得 Wind 数据。

## Runtime layout

- Wind CLI is vendored in this repo at `vendor/wind-mcp-skill/scripts/cli.mjs`.
- `services/marketWindProvider.js` resolves the CLI in this order:
  1. `WIND_CLI_PATH`
  2. `vendor/wind-mcp-skill/scripts/cli.mjs`
  3. `~/.codex/skills/wind-mcp-skill/scripts/cli.mjs`

## Secret

The CLI reads `WIND_API_KEY` in this order:

1. process env `WIND_API_KEY`
2. `vendor/wind-mcp-skill/config.json`
3. `/root/.wind-aifinmarket/config`

Do not commit `config.json`. It is ignored by git.

GitHub Actions writes `${{ secrets.WIND_API_KEY }}` to `/root/.wind-aifinmarket/config` during deploy when that secret exists.

## Deploy behavior

If Wind is configured, `/blogapi/market/style` and `/blogapi/market/value` return `source: "wind"`.

If Wind is missing or fails, the service falls back to the existing public-source builder, so the website should not 500 because of Wind runtime configuration alone.
