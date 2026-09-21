# Data format

**English** | [简体中文](DATA_FORMAT.zh-CN.md)

## Storage and backups

The browser storage key is `family_asset_ledger_v2`. JSON backups identify the app with `app: family_asset_ledger` and are exported as version `2.3`. The app accepts versions `1.0`, `2.0`, `2.1`, `2.2` and `2.3`, as well as older local data without a version field.

The language preference is stored separately in `family_asset_ledger_language` as `zh-CN` or `en`; it is not included in backups. Switching languages changes the interface only. User-entered text, member IDs, internal change-reason values, currency and amounts remain unchanged. The example preview uses the language selected when it is opened; existing records are never renamed automatically.

The appearance preference is stored separately in `family_asset_ledger_theme` as `system`, `light` or `dark`; it is not included in backups. The default, `system`, follows the device theme. A manual selection takes precedence. Changing appearance does not modify ledger data or unsaved forms.

| Field | Meaning |
| --- | --- |
| `currency` | One currency for the ledger, as an uppercase three-letter code such as `CNY`, `USD` or `EUR` |
| `members` | Member display names and stable IDs |
| `assets` | Asset and debt accounts; an empty array is valid |
| `history` | Historical snapshots grouped by `all`, `p1`, `p2` and `share` |
| `logs` | Balance changes for individual accounts |
| `targets` | Lower and upper allocation targets for four financial asset categories |
| `lastBackupTime` | Most recent backup or restore time; may be empty |
| `savedAt` | Time the data was written |

Backups also contain `backupAt`. When an older backup lacks member settings, the current member settings are retained. Missing history and logs become empty collections; they are not merged with the current ledger.

Assets, debts, history and logs all use the same currency, selected from the built-in currency list. Changing currency does not convert or rewrite amounts and does not create balance-change records. The top-bar selection takes effect only after storage is written successfully; a failed write restores the previous selection. Member names are saved separately. Older or unversioned backups without a currency are interpreted as `CNY`. Versions `2.2` and `2.3` must include a valid currency, or the entire backup is rejected. The example preview uses the current currency and disables currency changes while open.

## Members and amounts

`p1` and `p2` are stable member IDs. `share` identifies shared ownership; `all` is an aggregate view only. Renaming members does not change account ownership or historical amounts.

`assets[].amount` is nonnegative for both assets and debts. Debt accounts also use `category: debt` and `isLiability: true`. Net worth is the sum of non-debt assets minus the sum of debts. All currencies use at most two decimal places; newly entered amounts are rounded to `0.01`. Changing currency does not change precision. Amounts must be finite, with an absolute value no greater than `Number.MAX_SAFE_INTEGER / 100`.

Allocation targets contain `cash`, `fixed`, `fund` and `gold`. Each target must satisfy `0 ≤ min ≤ max ≤ 100`; zero is allowed. Saving and importing apply the same validation rules.

## Balance-change records

Updating a balance changes only the selected account. The app saves the entered balance and its difference from the previous value. The reason and note are optional; the default reason is a balance update. An unchanged amount does not create a duplicate record.

New records contain `id`, `assetId`, `owner`, `date`, `assetName`, `diff`, `type`, `desc`, `isLiability` and `isIncome`. `diff` is the actual change in account balance, with the same sign convention for assets and debts. `isIncome` is set only when the user explicitly chooses a reason that counts as investment income. Leaving the reason unselected does not count the change as recorded income.

Legacy fields such as `pairedAssetId`, `pairedOwner`, `pairedDiff`, `interestPaid`, `pendingCheck` and `netImpact` are preserved for backup compatibility. They are not used in calculations or displayed. Recent activity is filtered by each record's own `owner`.

## Saving and restoring

A first visit without local data initializes an empty ledger. It does not write example assets, logs or history; the first save operation persists data to browser storage. Updates do not clear an existing ledger or automatically identify and remove example records saved by older versions.

The example preview creates independent state in memory and disables ledger writes, imports and exports. Leaving the preview restores the previous ledger and view settings. Reloading reads the user's local ledger again. Preview data is never written to a backup.

Ordinary saves first create a copy, calculate snapshots and validate the data. Runtime state is replaced only after `localStorage` is written successfully. A failed write preserves the previous accounts, logs and snapshots.

If existing data cannot be read, the app preserves the original storage and blocks ordinary editing. Restoring a backup replaces data only after full validation and user confirmation. An empty ledger is valid and remains empty after reloading.

Daily snapshots use local dates in `YYYY-MM-DD` format. Updates on the same day replace that day's snapshot. Each snapshot satisfies `netWorth = totalAssets - liabilities`.
