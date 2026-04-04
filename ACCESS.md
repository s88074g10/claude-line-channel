# LINE Channel — Access & Delivery

[繁體中文](./ACCESS.zh-TW.md) | English

The LINE channel runs a webhook server that receives messages from LINE and forwards them to Claude Code. All access control lives in `~/.claude/channels/line/access.json` (or `$LINE_STATE_DIR/access.json`). The file is re-read on every inbound message, so changes take effect immediately without a restart.

## Quick reference

| | |
|---|---|
| Default DM policy | `allowlist` (drop all DMs unless userId is in `allowFrom`) |
| User ID format | Starts with `U` — e.g. `Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| Group ID format | Starts with `C` — e.g. `C1234567890abcdef` |
| Room ID format  | Starts with `R` |
| Config file | `~/.claude/channels/line/access.json` |

## DM policies

`dmPolicy` controls how direct messages from users not on the allowlist are handled.

| Policy | Behavior |
|---|---|
| `allowlist` (default) | Drop silently. Only users in `allowFrom` can reach the bot. |
| `disabled` | Drop everything, including allowlisted users and groups. |

## Finding user IDs

LINE user IDs are not directly visible in the app. The easiest way to find them:

1. Add the bot as a friend on LINE.
2. Send a message to the bot.
3. The server logs the unknown userId to `$LINE_STATE_DIR/unknown-groups.log` if the ID is not in the allowlist — check that file.
4. Alternatively, use the [LINE Developers Console](https://developers.line.biz/) → Messaging API → your channel → see incoming webhook logs.

## access.json schema

```json
{
  "dmPolicy": "allowlist",
  "allowFrom": [
    "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  ],
  "groups": {
    "C1234567890abcdef": {
      "requireMention": true,
      "allowFrom": []
    }
  },
  "mentionPatterns": ["^hey claude\\b"],
  "textChunkLimit": 5000,
  "chunkMode": "newline",
  "fullAccess": false
}
```

### Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `dmPolicy` | `"allowlist"` \| `"disabled"` | `"allowlist"` | How to handle DMs |
| `allowFrom` | `string[]` | `[]` | User IDs allowed to DM the bot. Empty = allow all (when policy is `allowlist`) |
| `groups` | `object` | `{}` | Group/room policies keyed by group ID or room ID |
| `mentionPatterns` | `string[]` | `[]` | Regex patterns that count as a mention (applied to message text) |
| `textChunkLimit` | `number` | `5000` | Max characters per LINE message chunk |
| `chunkMode` | `"length"` \| `"newline"` | `"newline"` | How to split long messages |
| `fullAccess` | `boolean` | `false` | `true` = `upload_file` may access any path on the host; `false` = inbox directory only |

### Group policy fields

| Field | Type | Default | Description |
|---|---|---|---|
| `requireMention` | `boolean` | `true` | Only respond when the bot is @mentioned or message matches `mentionPatterns` |
| `allowFrom` | `string[]` | `[]` | If non-empty, only these user IDs in the group can trigger the bot |

## Groups

Groups are opt-in. Add the group ID to `groups` with a policy:

```json
"groups": {
  "C1234567890abcdef": {
    "requireMention": true,
    "allowFrom": []
  }
}
```

To find a group ID: when the bot receives a message from an unknown group, the group ID is logged to `$LINE_STATE_DIR/unknown-groups.log`.

### Mention detection

With `requireMention: true`, the bot responds when:
- The message contains a structured `@botname` mention
- The message text matches any regex in `mentionPatterns`

Example — respond to "claude" anywhere in the message:

```json
"mentionPatterns": ["\\bclaude\\b"]
```

## Tools exposed to Claude

| Tool | Purpose |
|---|---|
| `reply` | Send a text message to a LINE chat. Takes `chat_id` + `text`. Auto-chunks long messages. Uses the free Reply API when possible (within 25 s of the inbound message), falls back to Push API. |
| `get_content` | Download a LINE media message (image, video, audio, file) to the inbox directory. Returns the file path and, for images, an inline preview. |
| `send_image` | Send an image to a LINE chat using publicly accessible HTTPS URLs. |
| `upload_file` | Upload a file **from the inbox directory only** to gofile.io with a password and expiry. Returns the download link and password. |
| `fetch_messages` | Returns a note that LINE does not provide message history for bots. |

## Reply API vs Push API

LINE's **Reply API** is free but requires using the reply token within 30 seconds of the inbound message. The plugin stores tokens with a 25-second TTL and always tries Reply first.

The **Push API** is used as a fallback (and for chunked messages after the first 5). Push messages count against your LINE plan's monthly quota.

## Security notes

- `upload_file` enforces that the file is inside the inbox directory (`$LINE_STATE_DIR/inbox/`). Claude cannot be instructed via LINE messages to upload arbitrary files from the host.
- The webhook endpoint verifies LINE's HMAC-SHA256 signature using constant-time comparison to prevent timing attacks.
- The `.env` file is chmod'd to 0600 on startup.
- `access.json` is written atomically via a temp file + rename.
