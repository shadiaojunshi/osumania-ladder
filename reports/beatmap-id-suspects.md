# 可疑 beatmapId / beatmapsetId（自动检测，只读）

生成时间：2026-09-18T02:44:22.992Z
数据来源：**从部署站 `osumania-ladder.pages.dev` 的构建产物里抽出的线上快照**（50 场比赛 / 4715 张谱面）——本地 checkout 缺 MKTC 2025（站长的改动经 GitHub 提交，本地未 pull），所以扫的是线上数据。本地再跑一次用：`node scripts/find-suspicious-ids.mjs`（默认扫 `data/tournaments`）。

> 口径：**0 / 1 / 负数一律视为占位或未提交**（与 `src/lib/beatmapIds.ts` 同一实现）。
> 「同一 setId 挂 ≥3 首不同的歌」= 这个 id 不可靠。

## 总览

- **占位 ID**：36 条
- **不可靠的 setId**：0 组（共 0 条记录）
- **同一 bid 挂多首不同的歌**：8 组

## 1. 占位 ID（0 / 1 / 负数）

| 比赛 | 轮次 | 槽位 | 键型 | beatmapId | beatmapsetId | 名称 |
| --- | --- | --- | --- | --- | --- | --- |
| MKTC 2025 | Qual | HB1 | HB2 | — | 1 | Toromaru - Curiosity [Stage 7: Inquisitiveness Lv. |
| MKTC 2025 | RO32 | RC3 | TC | — | 1 | daisan - Yukidoke-iro Furawazu [RC3 Whiteout Lv.31 |
| MKTC 2025 | RO16 | RC1 | SS | — | 1 | Senya - Yakusoku no Kimi (Cut Ver.) [RC1 9th Speed |
| MKTC 2025 | RO16 | RC2 | JS | 5193095 | 1 | Rairyu - ra'am (STARLiGHT Mix) [RC2 Vogelzauberin] |
| MKTC 2025 | RO16 | LN2 | LNWC | — | 1 | OSTER project - SpaceLand TOYBOX [LN2 Joyful] |
| MKTC 2025 | QF | RC1 | SS | — | 1 | Army Of Lovers - Crucified [RC1 Made in Heaven Lv. |
| MKTC 2025 | QF | RC2 | SA | 5212106 | 1 | DJ SHARPNEL - Mmmmmmm [RC2 W Lv.35] |
| MKTC 2025 | QF | RC4 | TC | — | 1 | Kolaa - async [RC4 await Lv.36] |
| MKTC 2025 | QF | TB | TB | — | 1 | NormalM - Luas na Gaoithe: IU [Sreabhadh: Thar Sha |
| MKTC 2025 | SF | RC1 | SS | — | 1 | nowisee - Ko Inu (Cut Ver.) [RC1 autism spectrum L |
| MKTC 2025 | SF | RC3 | SA | — | 1 | HanStone - The Final Musical Dance I [RC3 Final Sh |
| MKTC 2025 | SF | RC4 | FCJ | — | 1 | Suzumenome feat. KASANE TETO - BRAINWAVES' GOUGE [ |
| MKTC 2025 | SF | RC7 | MX | — | 1 | nasanoa - forlorn (cut) [RC7 Melancholy Lv.37] |
| MKTC 2025 | SF | LN4 | LNTC | 4883790 | 1 | Monster Siren Records - Revealing [LN4 Virtuosa Lv |
| MKTC 2025 | SF | HB2 | HB2 | — | 1 | Team Grimoire - Aphasia [HB2 Lugere In 0 Dicibel L |
| MKTC 2025 | SF | SV1 | SVMX | — | 1 | かめりあ - Another Xronixle [NSV] |
| MKTC 2025 | SF | TB | TB | — | 1 | Sydosys - Partition [Nébuleuse (Tiebreaker) Lv.40] |
| MKTC 2025 | F | RC1 | SS | — | 1 | n.k feat. Hatsune Miku - That Girl, Ms. Hell's Ang |
| MKTC 2025 | F | RC2 | SA | — | 1 | Falcom Sound Team jdk - GREAT PLAINS: PAN-GAIA [RC |
| MKTC 2025 | F | RC4 | CJ | — | 1 | MINT - CYCLONE [RC4 Vortex Lv.40] |
| MKTC 2025 | F | RC7 | DP | — | 1 | tieLeaf - Nejimaku Tokei ga Tsuki no Michikake o K |
| MKTC 2025 | F | RCX | TC | — | 1 | Lamberti phil - Nebura [RCX Hard Lv.43] |
| MKTC 2025 | F | HB1 | HB1 | 5228237 | 1 | Kobaryo - Unlimited Hyperlink [HB1 Infinite Nexus  |
| MKTC 2025 | F | HB2 | HB2 | — | 1 | 7mai - Binary Wonderland [HB2 Continue from Save L |
| MKTC 2025 | F | HB3 | MNTB | — | 1 | NormalM - Radiant Spectrala [HB3 Prism Lv.42] |
| MKTC 2025 | F | LN4 | LNTC | — | 1 | YURRY CANON - Tsukuyomi Step (feat. nameless) [LN4 |
| MKTC 2025 | F | TB | TB | — | 1 | Camellia - Looking for Edge of Ground [Where the C |
| MKTC 2025 | GF | RC1 | SS | — | 1 | Akatsuki Records - Mizuiro Raindrop [RC1 Yukai na  |
| MKTC 2025 | GF | RC2 | JS | — | 1 | Hoshimachi Suisei - Starry Jet (Cut Ver.) [RC2 Let |
| MKTC 2025 | GF | RC3 | SA | — | 1 | Daisuke Achiwa - Nefertiti (Ver. MMXI By Toshinori |
| MKTC 2025 | GF | RC4 | FCJ | — | 1 | LUZE - fibrolite [RC4 Opalescent Lv.44] |
| MKTC 2025 | GF | RC5 | ADP | — | 1 | hkmori - right here [RC5 effet psychologique Lv.42 |
| MKTC 2025 | GF | HB1 | HB1 | — | 1 | MetaHumanBoi - Solar Strike [HB1 Luminous Lv.42] |
| MKTC 2025 | GF | HB2 | HB2 | — | 1 | AAAA - Splash the Beat!! [HB2 Chromatique Pulsatio |
| MKTC 2025 | GF | HB3 | HB3 | — | 1 | Codly - Vainglorious Demon (Cut Ver.) [HB3 black b |
| MKTC 2025 | GF | SV1 | PDSV | — | 1 | t+pazolite - Lilac Feel [SV1 Epilogue of Traveler  |

## 2. 不可靠的 setId（下面挂着多首不同的歌）

（无）
## 3. 同一 bid 挂多首不同的歌（需人工判断：可能只是同图两种写法）

### bid 3963299

- 4DM2023 · RO32 · RC5 · `TC` · RC5
- TSC2 · SF · RC3 · `TC` · The Flashbulb - Undiscovered Colors (Cut Ver.) [Achromatic 1

### bid 3970874

- 4DM2023 · RO32 · SV1 · `SI` · SV1
- VNMC 4K 2025 · RO32 · SV1 · `SI` · Kakeru - Progress (cut ver.) [wokrs (sv)]

### bid 3978783

- 4DM2023 · RO16 · LN1 · `RE` · LN1
- JAST · Playoff · LN1 · `RE` · luvlxckdown - tbh i dont like being social [introverted [edi

### bid 3917229

- 4DM2023 · SF · HB2 · `HB4` · HB2
- AC · RO64 · HB1 · `HB4` · Virtual Riot - Don't Worry [Mutation.]

### bid 3642199

- 4DM2023 · F · RC7 · `JTC` · RC7
- GBC 2025 Spring S&EX · EX1 · RC2 · `JTC` · A.SAKA - KARAKURI [Orient]

### bid 4018544

- 4DM2023 · GF · HB2 · `HB3` · HB2
- MCLT 4K 2026 · SF · HB3 · `HB3` · lhk - 5D TETRIS MATCH & REMATCH (Cut Ver.) [Ultimatris]

### bid 4099552

- 4DM2023 · GF · LN3 · `LNMX` · LN3
- MCLT 4K 2025 · F · LN3 · `LNMX` · sasakure.UK feat. Hatsune Miku + KAITO - AMARA (Daimirai Den

### bid 4417278

- PHNM2025 · GF · HB3 · `HB3` · Frums + nitro - overdead. [%underflow_error 1.1x]
- MCNC 4K 2024 · SF · HB3 · `HB3` · HB3

## 怎么修

- **占位 ID**：这些 id 不是真的，**清掉比留着好**（清掉后上传页会按"缺 BID"处理，
  不再拿它去下载/分组）。真 ID 要么用「贴 BID 补传」按 BID 取回，要么在编辑页手工填。
- **不可靠的 setId**：说明这个 set id 是错的（多为转换器占位或复制粘贴）。
  确认后清掉该 setId；需要保留的话必须换成一个只对应这首曲子的真 setId。
- 运行时已经对这类值做了防护：上传解析不接受占位 ID、冲突检查器不按占位 ID 分组、
  同一个 setId 下出现多首不同的歌时不再当作"同 set 键型分歧"报出来。
