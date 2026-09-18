# 疑似键型误标候选（自动检测）

生成时间:2026-09-18T08:49:33.575Z
扫描:data/tournaments · 谱面 4750 张

> **只读报告**,不修改任何比赛数据。候选按证据强度排序,高置信只是"先看这批",不是自动结论 ——
> 有些分歧纯粹是两个编辑者口径不同(同一张图一个算 HB2、一个算 HB3),需要人来拍板。

## 总览

- 候选:19 张(高 10 / 中 9 / 低 0)
- 涉及比赛:11 个
- 能给出去向建议的:LNmainHB 4 · LNMX 2 · HB3 2 · ADP 1 · JTC 1 · ME 1

**先看「高置信」**:它们要么"同一张图在别处被标成别的键型且这里是少数派",要么同时命中多个弱指纹。
「中置信」里最多的那一类来自主信号 S7 —— 整个组的键型同质化到全库罕见(详见信号说明)。

## 高置信

| 置信 | 分数 | 比赛 | 轮次 | 槽位 | 大类 | 当前键型 | 建议 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 高 | 6 | MCNC 4K 2024 | Playoff2 | LN3 | LN | LNWC | LNMX | 同一 beatmapId 3947211 在别处被标为 LNMX×2 / LNWC×1,当前 LNWC 是少数派<br>同一 beatmapset 1913501 的同类图多数标为 LNMX |
| 高 | 6 | MCNC 4K 2024 | Qual | RC1 | RC | TC | ADP | 同一 beatmapId 4651348 在别处被标为 ADP×2 / TC×1,当前 TC 是少数派<br>同一 beatmapset 2198005 的同类图多数标为 ADP |
| 高 | 6 | MCNC 4K 2024 | Playoff1 | RC5 | RC | MX | JTC | 同一 beatmapId 4462321 在别处被标为 JTC×2 / MX×1,当前 MX 是少数派<br>同一 beatmapset 2123348 的同类图多数标为 JTC |
| 高 | 5 | CET 4K 2026 | Playin | RC1 | RC | SS | — | CET 4K 2026 Playin 的 RC 组 8 张只用 6 种键型(SS / JS / SA / DP / MX / ADP)；全库 39 个同规模 RC 组里这样只占 3%,而它正是"RC 的第一个键型" SS<br>CET 4K 2026 Playin 的 RC 组里其它 7 张都不是 SS,只有它还是默认值 |
| 高 | 5 | RDC 2024 | QF/SF | A-LN1 | LN | RE | — | RDC 2024 QF/SF 的 LN 组 2 张只用 1 种键型(RE)；全库 73 个同规模 LN 组里这样只占 1%,而它正是"LN 的第一个键型" RE<br>RDC 2024 QF/SF 的 LN 组里 RE 出现 2 次(同组键型重复) |
| 高 | 5 | RDC 2024 | GF | A-RC1 | RC | SS | — | RDC 2024 GF 的 RC 组 8 张只用 5 种键型(SS / JS / FCJ / MX / CJ)；全库 39 个同规模 RC 组里这样只占 3%,而它正是"RC 的第一个键型" SS<br>RDC 2024 GF 的 RC 组里其它 7 张都不是 SS,只有它还是默认值 |
| 高 | 5 | RDC 2024 | QF/SF | B-LN1 | LN | RE | — | RDC 2024 QF/SF 的 LN 组 2 张只用 1 种键型(RE)；全库 73 个同规模 LN 组里这样只占 1%,而它正是"LN 的第一个键型" RE<br>RDC 2024 QF/SF 的 LN 组里 RE 出现 2 次(同组键型重复) |
| 高 | 5 | TSC2 | RO16 | LN1 | LN | RE | — | TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE<br>TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复) |
| 高 | 5 | TSC2 | RO16 | LN2 | LN | RE | — | TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE<br>TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复) |
| 高 | 5 | TSC2 | RO16 | LN3 | LN | RE | — | TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE<br>TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复) |

## 中置信

| 置信 | 分数 | 比赛 | 轮次 | 槽位 | 大类 | 当前键型 | 建议 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 中 | 4 | MCNC 4K 2024 | RO32 | LN1 | LN | RE | LNMX | 同一 beatmapId 4681225 在别处被标为 LNMX(各一次,平票),而这里是默认值 RE<br>MCNC 4K 2024 RO32 的 LN 组里其它 2 张都不是 RE,只有它还是默认值 |
| 中 | 4 | MCNC 4K 2025 | F | HB2 | HB | HB1 | HB3 | 同一 beatmapId 4303090 在别处被标为 HB3(各一次,平票),而这里是默认值 HB1<br>MCNC 4K 2025 F 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值 |
| 中 | 4 | WOGS 2025 | RO16 | LN3 | HB | HB1 | — | 难度名里出现「LN / Release」一路的词(`P*Light feat. mow*2 - OVERDRIVERS [EXTREME [LN]]`),当前标的是 HB1(大类第一个键型)<br>WOGS 2025 RO16 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值 |
| 中 | 3 | CMIT 4K 2026 | QF | HB1 | HB | HB1 | LNmainHB | HB 图 ln 6 比 rf 4.44 高 1.56,更像 LN 主导的 HB<br>CMIT 4K 2026 QF 的 HB 组里其它 3 张都不是 HB1,只有它还是默认值 |
| 中 | 3 | GBC 2025 Spring S&EX | S4 | HB2 | HB | HB1 | HB3 | 同一 beatmapId 5101249 在别处被标为 HB3(各一次,平票),而这里是默认值 HB1 |
| 中 | 3 | MWC 4K 2023 | SF | SV1 | SV | SV1 | ME | 同一 beatmapId 4294644 在别处被标为 ME(各一次,平票),而这里是默认值 SV1 |
| 中 | 3 | MWC 4K 2025 | RO16 | HB1 | HB | HB1 | LNmainHB | HB 图 ln 10 比 rf 8 高 2.00,更像 LN 主导的 HB<br>MWC 4K 2025 RO16 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值 |
| 中 | 3 | THMC 4 | Group | HB1 | HB | HB1 | LNmainHB | HB 图 ln 7 比 rf 5 高 2.00,更像 LN 主导的 HB<br>THMC 4 Group 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值 |
| 中 | 3 | TSC2 | RO32 | HB1 | HB | HB1 | LNmainHB | HB 图 ln 4 比 rf 2.5 高 1.50,更像 LN 主导的 HB<br>TSC2 RO32 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值 |

## 低置信（弱指纹,仅供参考）

（默认不列出。弱指纹的意思是:全库还有 900 多张图按"大类第一个键型"躺着,其中绝大多数是对的,
只有弱指纹并不足以说明标错。要看全量:`node scripts/find-suspect-realtypes.mjs --min-score 1`。）

## 按比赛分组（高 + 中,便于复核）

### MCNC 4K 2024 (osumania-4k-chinese-national-cup-2024) — 4 张

- [高/6] Playoff2 · LN3 · `LNWC` → `LNMX` · Tonari no Niwa wa Aoi (NIWASHI+Aoi) - Polacro [Side:Delta]
  - 同一 beatmapId 3947211 在别处被标为 LNMX×2 / LNWC×1,当前 LNWC 是少数派
  - 同一 beatmapset 1913501 的同类图多数标为 LNMX
- [高/6] Qual · RC1 · `TC` → `ADP` · Aphex Twin - Bucephalus Bouncing Ball (Cut Ver.) [Conundrum]
  - 同一 beatmapId 4651348 在别处被标为 ADP×2 / TC×1,当前 TC 是少数派
  - 同一 beatmapset 2198005 的同类图多数标为 ADP
- [高/6] Playoff1 · RC5 · `MX` → `JTC` · Pa's Lam System - City Lights Feat. EVO+ , Jinmenusagi (Pa's Lam System Remix) [Phosphorescent]
  - 同一 beatmapId 4462321 在别处被标为 JTC×2 / MX×1,当前 MX 是少数派
  - 同一 beatmapset 2123348 的同类图多数标为 JTC
- [中/4] RO32 · LN1 · `RE` → `LNMX` · Ling Yuan yousa - Tao Hua Xiao [Beng Beng Tiao Tiao]
  - 同一 beatmapId 4681225 在别处被标为 LNMX(各一次,平票),而这里是默认值 RE
  - MCNC 4K 2024 RO32 的 LN 组里其它 2 张都不是 RE,只有它还是默认值

### TSC2 (two-shot-cup-2) — 4 张

- [高/5] RO16 · LN1 · `RE` · Rice Shower (CV: Iwami Manaka) - Sasayaka na Inori (TV Size) [My Little Dark Princess (nerf ver.)]
  - TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE
  - TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复)
- [高/5] RO16 · LN2 · `RE` · Takanashi Hoshino (CV: Hanamori Yumiri) - Hoshino Song (Quilt remix) [DenYi's Hard]
  - TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE
  - TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复)
- [高/5] RO16 · LN3 · `RE` · San-Z - 60% Fantasy [elexire's Hard]
  - TSC2 RO16 的 LN 组 3 张只用 1 种键型(RE)；全库 102 个同规模 LN 组里这样只占 2%,而它正是"LN 的第一个键型" RE
  - TSC2 RO16 的 LN 组里 RE 出现 3 次(同组键型重复)
- [中/3] RO32 · HB1 · `HB1` → `LNmainHB` · Designant - Designant. [Toko's Present]
  - HB 图 ln 4 比 rf 2.5 高 1.50,更像 LN 主导的 HB
  - TSC2 RO32 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值

### RDC 2024 (roasted-duck-cup-2024) — 3 张

- [高/5] QF/SF · A-LN1 · `RE` · Thaehan - Doki-Doki [Why notes are supposed to be held?]
  - RDC 2024 QF/SF 的 LN 组 2 张只用 1 种键型(RE)；全库 73 个同规模 LN 组里这样只占 1%,而它正是"LN 的第一个键型" RE
  - RDC 2024 QF/SF 的 LN 组里 RE 出现 2 次(同组键型重复)
- [高/5] GF · A-RC1 · `SS` · dj TAKA feat. Erika Mochizuki - MOON [Sparkling moonlight]
  - RDC 2024 GF 的 RC 组 8 张只用 5 种键型(SS / JS / FCJ / MX / CJ)；全库 39 个同规模 RC 组里这样只占 3%,而它正是"RC 的第一个键型" SS
  - RDC 2024 GF 的 RC 组里其它 7 张都不是 SS,只有它还是默认值
- [高/5] QF/SF · B-LN1 · `RE` · meiyo - Nani Yatte mo Umaku Ikanai [waht]
  - RDC 2024 QF/SF 的 LN 组 2 张只用 1 种键型(RE)；全库 73 个同规模 LN 组里这样只占 1%,而它正是"LN 的第一个键型" RE
  - RDC 2024 QF/SF 的 LN 组里 RE 出现 2 次(同组键型重复)

### CET 4K 2026 (chinese-extraterrestrials-tournament-4k-2026) — 1 张

- [高/5] Playin · RC1 · `SS` · LUZE feat. Emew - Unmeiron [Predestinazione]
  - CET 4K 2026 Playin 的 RC 组 8 张只用 6 种键型(SS / JS / SA / DP / MX / ADP)；全库 39 个同规模 RC 组里这样只占 3%,而它正是"RC 的第一个键型" SS
  - CET 4K 2026 Playin 的 RC 组里其它 7 张都不是 SS,只有它还是默认值

### MCNC 4K 2025 (osumania-4k-chinese-national-cup-2025) — 1 张

- [中/4] F · HB2 · `HB1` → `HB3` · kanemiko - Cold Fusion [Catalyst (cut 1.05x)]
  - 同一 beatmapId 4303090 在别处被标为 HB3(各一次,平票),而这里是默认值 HB1
  - MCNC 4K 2025 F 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值

### WOGS 2025 (winter-osumania-grand-slam-tournament-2025) — 1 张

- [中/4] RO16 · LN3 · `HB1` · P*Light feat. mow*2 - OVERDRIVERS [EXTREME [LN]]
  - 难度名里出现「LN / Release」一路的词(`P*Light feat. mow*2 - OVERDRIVERS [EXTREME [LN]]`),当前标的是 HB1(大类第一个键型)
  - WOGS 2025 RO16 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值

### CMIT 4K 2026 (china-osumania-4k-intermidiate-tournament-2026) — 1 张

- [中/3] QF · HB1 · `HB1` → `LNmainHB` · Sound piercer & ginkiha (feat. Yuzuha & NeLiME) - MI:LIGHT CONNECT [Extra]
  - HB 图 ln 6 比 rf 4.44 高 1.56,更像 LN 主导的 HB
  - CMIT 4K 2026 QF 的 HB 组里其它 3 张都不是 HB1,只有它还是默认值

### GBC 2025 Spring S&EX (gbc2025sex) — 1 张

- [中/3] S4 · HB2 · `HB1` → `HB3` · KERO - Color Printer [CMYK]
  - 同一 beatmapId 5101249 在别处被标为 HB3(各一次,平票),而这里是默认值 HB1

### MWC 4K 2023 (osumania-4k-world-cup-2023) — 1 张

- [中/3] SF · SV1 · `SV1` → `ME` · ZxNX as "Delaina" - End Me [CHOKE]
  - 同一 beatmapId 4294644 在别处被标为 ME(各一次,平票),而这里是默认值 SV1

### MWC 4K 2025 (osumania-4k-world-cup-2025) — 1 张

- [中/3] RO16 · HB1 · `HB1` → `LNmainHB` · MisomyL - Amnehilesie [Solitude]
  - HB 图 ln 10 比 rf 8 高 2.00,更像 LN 主导的 HB
  - MWC 4K 2025 RO16 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值

### THMC 4 (touhou-project-mania-cup-4th) — 1 张

- [中/3] Group · HB1 · `HB1` → `LNmainHB` · Yuuhei Satellite - Hatenaki Kaze no Kiseki sae ~Ha~ (Cut ver.) [Kochiya Sanae]
  - HB 图 ln 7 比 rf 5 高 2.00,更像 LN 主导的 HB
  - THMC 4 Group 的 HB 组里其它 2 张都不是 HB1,只有它还是默认值

## 信号说明（怎么读）

| 信号 | 分值 | 含义 |
| --- | --- | --- |
| S7 结构罕见度 | 4(默认值)/2 | 本轮同大类组里键型同质化到罕见:全库同 (大类, 组规模) 的组里,这种"只用了这么少的键型"的占比 ≤5% |
| S1 跨比赛共识 | 3~5 | 同一个 beatmapId 在别处被标成别的键型。严格多数(≥2 票且多于第二名)算强证据;平票时只有"当前是大类第一个键型"才算 3 分 |
| S2 同一套图共识 | 2 | 同一 beatmapset 里同类谱面的键型不一致 |
| S4 难度名关键词 | 2~3 | 难度名里出现别的子类型的关键词(如标了 SS 但名字里有 Jack)。弱信号,常有歌曲名的误报 |
| S5 HB 的 ln 倒挂 | 2 | HB 图 ln 难度比 rf 高 ≥1.5 却标成 HB1(速度/通用型) |
| S3/S6 弱指纹 | 1 | 同组键型重复且撞上默认值 / 同组只剩它还是默认值 |

共识类信号只用**严格多数**,平票不算;`PD*` 待分类标记既不作为证据也不作为共识目标。
S7 的基线是用全库现算的(不是写死的),所以数据变了报告会自动跟着变。
