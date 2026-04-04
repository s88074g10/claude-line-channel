# LINE Channel — 存取控制與傳送設定

[English](./ACCESS.md) | 繁體中文

LINE channel 運行一個 webhook server 接收 LINE 訊息並轉發給 Claude Code。所有存取控制設定存放於 `~/.claude/channels/line/access.json`（或 `$LINE_STATE_DIR/access.json`）。此檔案在每則訊息到達時都會重新讀取，修改後無需重啟即可生效。

## 快速參考

| | |
|---|---|
| 預設 DM 政策 | `allowlist`（除非 userId 在 `allowFrom` 中，否則丟棄所有私訊） |
| 用戶 ID 格式 | 以 `U` 開頭 — 例如 `Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| 群組 ID 格式 | 以 `C` 開頭 — 例如 `C1234567890abcdef` |
| 聊天室 ID 格式 | 以 `R` 開頭 |
| 設定檔位置 | `~/.claude/channels/line/access.json` |

## DM 政策

`dmPolicy` 控制來自不在 allowlist 中的用戶的私訊處理方式。

| 政策 | 行為 |
|---|---|
| `allowlist`（預設） | 靜默丟棄。只有 `allowFrom` 中的用戶可以聯繫機器人。 |
| `disabled` | 丟棄所有訊息，包括 allowlist 中的用戶和群組。 |

## 尋找用戶 ID

LINE 用戶 ID 在 app 中不直接顯示。最簡單的方式：

1. 將機器人加為好友。
2. 傳任一訊息給機器人。
3. 若該 ID 不在 allowlist 中，server 會將其記錄到 `$LINE_STATE_DIR/unknown-groups.log` — 查看該檔案即可找到 ID。
4. 或使用 [LINE Developers Console](https://developers.line.biz/) → Messaging API → 你的頻道 → 查看 webhook log。

## access.json 格式

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

### 欄位說明

| 欄位 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `dmPolicy` | `"allowlist"` \| `"disabled"` | `"allowlist"` | 私訊處理方式 |
| `allowFrom` | `string[]` | `[]` | 允許私訊機器人的用戶 ID。**空陣列 = 允許所有人。** |
| `groups` | `object` | `{}` | 群組/聊天室政策，以群組 ID 或聊天室 ID 為 key |
| `mentionPatterns` | `string[]` | `[]` | 視為提及的 regex pattern（套用至訊息文字） |
| `textChunkLimit` | `number` | `5000` | 每則 LINE 訊息的最大字元數 |
| `chunkMode` | `"length"` \| `"newline"` | `"newline"` | 長訊息分段方式 |
| `fullAccess` | `boolean` | `false` | `true` = `upload_file` 可存取主機上任意路徑；`false` = 僅限 inbox 目錄 |

### 群組政策欄位

| 欄位 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `requireMention` | `boolean` | `true` | 只在被 @ 或訊息符合 `mentionPatterns` 時回應 |
| `allowFrom` | `string[]` | `[]` | 若非空，只有這些用戶 ID 可以在群組中觸發機器人 |

## 群組

群組預設為關閉，需逐一加入 `groups` 並設定政策：

```json
"groups": {
  "C1234567890abcdef": {
    "requireMention": true,
    "allowFrom": []
  }
}
```

尋找群組 ID：當機器人收到來自未知群組的訊息時，群組 ID 會被記錄到 `$LINE_STATE_DIR/unknown-groups.log`。

### 提及偵測

`requireMention: true` 時，以下情況會觸發機器人回應：
- 訊息包含結構化的 `@機器人名稱` 提及
- 訊息文字符合 `mentionPatterns` 中任一 regex

若無法在 LINE 中直接 @（部分舊版用戶端不支援），可用關鍵字觸發：

```json
"mentionPatterns": ["\\bclaude\\b"]
```

## Claude 可使用的工具

| 工具 | 用途 |
|---|---|
| `reply` | 傳送文字訊息到 LINE 聊天（私訊或群組）。接受 `chat_id` 和 `text`。長訊息自動分段。25 秒內優先使用免費的 Reply API，逾時改用 Push API。 |
| `get_content` | 下載 LINE 用戶傳送的媒體訊息（圖片/影片/音訊/檔案）到 inbox 目錄。回傳檔案路徑，圖片另附預覽。 |
| `send_image` | 透過公開 HTTPS URL 傳送圖片到 LINE 聊天。 |
| `upload_file` | 將檔案上傳至 gofile.io，並附上密碼和到期時間。回傳下載連結和密碼。預設只接受 inbox 目錄內的路徑；在 `access.json` 設定 `fullAccess: true` 可允許主機上任意路徑。 |
| `fetch_messages` | LINE 未開放訊息歷史 API — 此工具會回傳相關說明。 |

## Reply API 與 Push API

LINE 的 **Reply API** 免費，但 reply token 在收到訊息後 30 秒內必須使用。Plugin 以 25 秒 TTL 儲存 token，並優先嘗試 Reply API。

**Push API** 作為備用（以及第一批 5 則之後的分段訊息）。Push 訊息計入你的 LINE 方案每月配額。

## 安全說明

- `upload_file` 預設只允許 inbox 目錄內（`$LINE_STATE_DIR/inbox/`）的檔案。Claude 無法透過 LINE 訊息中的 prompt injection 被誘導上傳主機上的任意檔案。設定 `fullAccess: true` 時，可存取任意路徑，請僅在完全信任 `allowFrom` 中所有用戶時啟用。
- Webhook 端點以 HMAC-SHA256 驗證 LINE 簽章，使用 constant-time 比較防止 timing attack。
- `.env` 在啟動時自動 chmod 為 0600。
- `access.json` 透過 temp 檔案 + rename 的方式原子性寫入。
