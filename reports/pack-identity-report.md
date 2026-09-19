# 合包身份核对报告

生成时间：2026-09-19T02:49:54.163Z
本次由 `--identity-report` 生成（**只读体检**）：没有生成或上传任何包，也没有改动清单。


只列**需要人工核对**的项：同一个 BID / 同一组元数据下内容不同的谱面（已阻止合并，各自打包），
指向的文件缺失、身份无法确认的引用（来源标签未挂靠），以及**内容摘要相同但身份来源不同**
（现在的实现既不合并不报冲突，只在这里列出来量化规模）。内容等价的多路径引用属正常合并，只在运行日志里。

## 本次体检汇总

| 类型 | 槽位 | 可读引用 | 读取失败 | 同 BID/元数据但内容不同 | 缺文件身份不明 | 同内容不同身份来源 |
|---|---:|---:|---:|---:|---:|---:|
| SS | 250 | 238 | 0 | 0 | 11 | 1 |
| JS | 232 | 226 | 0 | 0 | 6 | 0 |
| SA | 226 | 214 | 0 | 0 | 11 | 1 |
| CJ | 178 | 174 | 0 | 0 | 4 | 0 |
| SJ | 63 | 62 | 0 | 0 | 1 | 0 |
| FCJ | 215 | 209 | 0 | 0 | 5 | 0 |
| MX | 243 | 230 | 0 | 0 | 13 | 0 |
| DP | 217 | 203 | 0 | 0 | 14 | 0 |
| ADP | 133 | 124 | 0 | 0 | 8 | 1 |
| STC | 63 | 57 | 0 | 0 | 6 | 0 |
| MTC | 58 | 54 | 0 | 0 | 4 | 1 |
| SATC | 2 | 2 | 0 | 0 | 0 | 0 |
| JTC | 77 | 74 | 0 | 0 | 3 | 0 |
| WTC | 53 | 50 | 0 | 0 | 3 | 0 |
| TC | 204 | 196 | 0 | 0 | 9 | 0 |
| ORC | 0 | - | - | - | - | - |
| HB1 | 284 | 274 | 0 | 0 | 11 | 2 |
| HB2 | 214 | 204 | 0 | 0 | 9 | 0 |
| HB3 | 239 | 227 | 0 | 1 | 9 | 3 |
| HB4 | 53 | 50 | 0 | 0 | 3 | 0 |
| HB5 | 0 | - | - | - | - | - |
| RCmainHB | 25 | 24 | 0 | 0 | 1 | 0 |
| LNmainHB | 46 | 47 | 0 | 0 | 0 | 0 |
| MXHB | 10 | 10 | 0 | 0 | 1 | 0 |
| MNTB | 64 | 61 | 0 | 0 | 3 | 0 |
| OHB | 1 | 1 | 0 | 0 | 0 | 0 |
| RE | 148 | 145 | 0 | 0 | 3 | 0 |
| CO | 161 | 152 | 0 | 0 | 8 | 0 |
| TE | 102 | 99 | 0 | 1 | 2 | 0 |
| DE | 354 | 337 | 0 | 0 | 16 | 2 |
| JW | 71 | 70 | 0 | 0 | 1 | 0 |
| SW | 32 | 31 | 0 | 1 | 1 | 0 |
| LNMX | 188 | 181 | 0 | 0 | 7 | 1 |
| LNWC | 45 | 41 | 0 | 0 | 3 | 1 |
| LNTC | 156 | 152 | 0 | 0 | 4 | 1 |
| IN | 1 | 1 | 0 | 0 | 0 | 0 |
| LNWL | 5 | 5 | 0 | 0 | 0 | 0 |
| OLN | 1 | 1 | 0 | 0 | 0 | 0 |
| SV1 | 37 | 55 | 0 | 0 | 2 | 0 |
| SV2 | 32 | 46 | 0 | 0 | 0 | 0 |
| SI | 57 | 67 | 0 | 0 | 4 | 0 |
| ME | 31 | 42 | 0 | 0 | 4 | 0 |
| SVMX | 63 | 79 | 0 | 0 | 4 | 0 |
| GM | 9 | 9 | 0 | 0 | 1 | 0 |
| PDSV | 7 | 11 | 0 | 0 | 0 | 0 |
| TB | 336 | 332 | 0 | 0 | 8 | 2 |

> `读取失败` = 这些引用没看清（下载/解压/解析失败），**不等于**它们没有重复。

## SS

### 文件缺失且身份无法确认（11 条）

- `maps/4-digit-osumania-world-cup-2023/round-3/RC2.osz`（no-bid，beatmapId=无）← 4DM2023RO16 RC2
- `maps/4-digit-osumania-world-cup-2023/round-4/RC2.osz`（no-bid，beatmapId=无）← 4DM2023QF RC2
- `maps/4-digit-osumania-world-cup-2023/round-6/RC2.osz`（no-bid，beatmapId=无）← 4DM2023F RC2
- `maps/gb-cup-2026-in-real-life/round-2/RC1.osz`（ambiguous-bid，beatmapId=5768891）← GBC 2026 IRLRO16 RC1
- `maps/osumania-4k-world-cup-2023/round-3/RC1.osz`（ambiguous-bid，beatmapId=4242933）← MWC 4K 2023RO16 RC1
- `maps/osumania-4k-world-cup-2023/round-4/RC1.osz`（ambiguous-bid，beatmapId=4283526）← MWC 4K 2023QF RC1
- `maps/osumania-4k-world-cup-2023/round-5/RC1.osz`（ambiguous-bid，beatmapId=4294646）← MWC 4K 2023SF RC1
- `maps/osumania-4k-world-cup-2023/round-7/RC1.osz`（ambiguous-bid，beatmapId=4310954）← MWC 4K 2023GF RC1
- `maps/osumania-4k-world-cup-2026/round-6/RC1.osz`（ambiguous-bid，beatmapId=5880886）← MWC 4K 2026F RC1
- `maps/the-gb-cup-2024-spring/round-6/RC4.osz`（no-bid，beatmapId=无）← GBC 2024 SpringA-2 RC4
- `maps/two-shot-cup-2/round-9/RC2.osz`（ambiguous-bid，beatmapId=5346892）← TSC2GF RC2

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `f8169ecad3264046`
  - **meta:buelow|revolver (sped up ver.)|lott|femme fatale 1.05x**：`maps/asia-suiji-cup-2025/round-4/RC3.osz` ← ASC 2025SF RC3
  - **bid:5309392**：`maps/mexico-mania-tournament-4k-2026/round-4/RC1.osz` ← MMT 2026SF RC1

## JS

### 文件缺失且身份无法确认（6 条）

- `maps/gb-cup-2026-in-real-life/round-1/ST2.osz`（ambiguous-bid，beatmapId=5754122）← GBC 2026 IRLQual ST2
- `maps/osumania-4k-world-cup-2023/round-5/RC2.osz`（ambiguous-bid，beatmapId=3770381）← MWC 4K 2023SF RC2
- `maps/osumania-4k-world-cup-2023/round-6/RC2.osz`（ambiguous-bid，beatmapId=3600992）← MWC 4K 2023F RC2
- `maps/osumania-4k-world-cup-2026/round-6/RC2.osz`（ambiguous-bid，beatmapId=5880778）← MWC 4K 2026F RC2
- `maps/the-gb-cup-2024-spring/round-2/RC3.osz`（no-bid，beatmapId=无）← GBC 2024 SpringB-2 RC3
- `maps/the-gb-cup-2024-spring/round-17/RC2.osz`（no-bid，beatmapId=无）← GBC 2024 SpringQF RC2

## SA

### 文件缺失且身份无法确认（11 条）

- `maps/4-digit-osumania-world-cup-2023/round-3/RC1.osz`（no-bid，beatmapId=无）← 4DM2023RO16 RC1
- `maps/4-digit-osumania-world-cup-2023/round-6/RC1.osz`（no-bid，beatmapId=无）← 4DM2023F RC1
- `maps/gb-cup-2026-in-real-life/round-2/RC2.osz`（ambiguous-bid，beatmapId=3341561）← GBC 2026 IRLRO16 RC2
- `maps/osumania-4k-world-cup-2023/round-1/RC2.osz`（ambiguous-bid，beatmapId=4253489）← MWC 4K 2023Qual RC2
- `maps/osumania-4k-world-cup-2023/round-2/RC2.osz`（ambiguous-bid，beatmapId=4211268）← MWC 4K 2023RO32 RC2
- `maps/osumania-4k-world-cup-2023/round-3/RC2.osz`（ambiguous-bid，beatmapId=3341549）← MWC 4K 2023RO16 RC2
- `maps/osumania-4k-world-cup-2023/round-4/RC2.osz`（ambiguous-bid，beatmapId=4272125）← MWC 4K 2023QF RC2
- `maps/osumania-4k-world-cup-2023/round-6/RC3.osz`（ambiguous-bid，beatmapId=3266500）← MWC 4K 2023F RC3
- `maps/osumania-4k-world-cup-2023/round-7/RC2.osz`（ambiguous-bid，beatmapId=3345153）← MWC 4K 2023GF RC2
- `maps/osumania-4k-world-cup-2023/round-7/RC3.osz`（ambiguous-bid，beatmapId=2979765）← MWC 4K 2023GF RC3
- `maps/osumania-4k-world-cup-2026/round-6/RC3.osz`（ambiguous-bid，beatmapId=5880816）← MWC 4K 2026F RC3

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `123fd43373cd17b5`
  - **meta:dj sharpnel|the power of underground|myzterion-|thrive 1.25x (244bpm)**：`maps/asia-suiji-cup-2025/round-5/RC1.osz` ← ASC 2025F RC1
  - **bid:4191812**：`maps/gbc2025sex/round-8/RC3.osz` ← GBC 2025 Spring S&EXEX4 RC3

## CJ

### 文件缺失且身份无法确认（4 条）

- `maps/osumania-4k-chilean-national-cup-2025/round-4/RC3.osz`（ambiguous-bid，beatmapId=4962381）← MCLT 4K 2025SF RC3
- `maps/roasted-duck-cup-2024/round-4/B-RC3.osz`（ambiguous-bid，beatmapId=4750422）← RDC 2024GF B-RC3
- `maps/south-korean-winter-tournament/round-2/RC4.osz`（ambiguous-bid，beatmapId=5485211）← SKWTRO16 RC4
- `maps/south-korean-winter-tournament/round-3/RC4.osz`（ambiguous-bid，beatmapId=5494774）← SKWTQF RC4

## SJ

### 文件缺失且身份无法确认（1 条）

- `maps/osumania-4k-world-cup-2023/round-3/RC3.osz`（ambiguous-bid，beatmapId=4242761）← MWC 4K 2023RO16 RC3

## FCJ

### 文件缺失且身份无法确认（5 条）

- `maps/osumania-4k-world-cup-2023/round-4/RC3.osz`（ambiguous-bid，beatmapId=4281865）← MWC 4K 2023QF RC3
- `maps/osumania-4k-world-cup-2023/round-5/RC4.osz`（ambiguous-bid，beatmapId=4294670）← MWC 4K 2023SF RC4
- `maps/osumania-4k-world-cup-2023/round-6/RC4.osz`（ambiguous-bid，beatmapId=4303024）← MWC 4K 2023F RC4
- `maps/osumania-4k-world-cup-2023/round-7/RC4.osz`（ambiguous-bid，beatmapId=4311929）← MWC 4K 2023GF RC4
- `maps/osumania-4k-world-cup-2026/round-6/RC4.osz`（ambiguous-bid，beatmapId=5880803）← MWC 4K 2026F RC4

## MX

### 文件缺失且身份无法确认（13 条）

- `maps/4-digit-osumania-world-cup-2023/round-3/RC3.osz`（no-bid，beatmapId=无）← 4DM2023RO16 RC3
- `maps/4-digit-osumania-world-cup-2023/round-5/RC4.osz`（no-bid，beatmapId=无）← 4DM2023SF RC4
- `maps/4-digit-osumania-world-cup-2024/round-6/RC4.osz`（ambiguous-bid，beatmapId=4490314）← 4DM 2024F RC4
- `maps/japanese-mania-championship-2/round-2/RC5(SV).osz`（ambiguous-bid，beatmapId=4597437）← JMC2Group RC5(SV)
- `maps/japanese-mania-championship-2/round-3/RC5(SV).osz`（ambiguous-bid，beatmapId=4617000）← JMC2RO16 RC5(SV)
- `maps/japanese-mania-championship-2/round-4/RC7(SV).osz`（ambiguous-bid，beatmapId=4625508）← JMC2QF RC7(SV)
- `maps/japanese-mania-championship-2/round-6/RC8(SV).osz`（ambiguous-bid，beatmapId=4654000）← JMC2F RC8(SV)
- `maps/japanese-mania-championship-2/round-7/RC8(SV).osz`（ambiguous-bid，beatmapId=4672895）← JMC2GF RC8(SV)
- `maps/osumania-4k-world-cup-2023/round-2/RC3.osz`（ambiguous-bid，beatmapId=4266250）← MWC 4K 2023RO32 RC3
- `maps/osumania-4k-world-cup-2023/round-4/RC6.osz`（ambiguous-bid，beatmapId=4284888）← MWC 4K 2023QF RC6
- `maps/osumania-4k-world-cup-2023/round-5/RC7.osz`（ambiguous-bid，beatmapId=4289276）← MWC 4K 2023SF RC7
- `maps/osumania-chilean-tournament-4k-2026/round-6/RC8.osz`（no-bid，beatmapId=无）← MCLT 4K 2026GF RC8
- `maps/vietnamese-rewind-mania-championship/round-6/RC7.osz`（ambiguous-bid，beatmapId=4926301）← VRMCGF RC7

## DP

### 文件缺失且身份无法确认（14 条）

- `maps/4-digit-osumania-world-cup-2023/round-4/RC4.osz`（no-bid，beatmapId=无）← 4DM2023QF RC4
- `maps/4-digit-osumania-world-cup-2023/round-6/RC6.osz`（no-bid，beatmapId=无）← 4DM2023F RC6
- `maps/4-digit-osumania-world-cup-2023/round-7/RC5.osz`（no-bid，beatmapId=无）← 4DM2023GF RC5
- `maps/gb-cup-2026-in-real-life/round-1/ST1.osz`（ambiguous-bid，beatmapId=5754201）← GBC 2026 IRLQual ST1
- `maps/gb-cup-2026-in-real-life/round-2/RC4.osz`（ambiguous-bid，beatmapId=5257868）← GBC 2026 IRLRO16 RC4
- `maps/mexico-mania-tournament-4k-2026/round-5/RC4.osz`（ambiguous-bid，beatmapId=5592600）← MMT 2026F RC4
- `maps/osumania-4k-chilean-national-cup-2025/round-5/RC5.osz`（ambiguous-bid，beatmapId=4984351）← MCLT 4K 2025F RC5
- `maps/osumania-4k-chilean-national-cup-2025/round-5/RC8.osz`（ambiguous-bid，beatmapId=4984352）← MCLT 4K 2025F RC8
- `maps/osumania-4k-world-cup-2023/round-2/RC4.osz`（ambiguous-bid，beatmapId=4266308）← MWC 4K 2023RO32 RC4
- `maps/osumania-4k-world-cup-2023/round-3/RC5.osz`（ambiguous-bid，beatmapId=4276098）← MWC 4K 2023RO16 RC5
- `maps/osumania-4k-world-cup-2023/round-5/RC6.osz`（ambiguous-bid，beatmapId=3019182）← MWC 4K 2023SF RC6
- `maps/osumania-4k-world-cup-2023/round-6/RC6.osz`（ambiguous-bid，beatmapId=4176510）← MWC 4K 2023F RC6
- `maps/osumania-4k-world-cup-2023/round-7/RC6.osz`（ambiguous-bid，beatmapId=4311930）← MWC 4K 2023GF RC6
- `maps/osumania-4k-world-cup-2026/round-6/RC6.osz`（ambiguous-bid，beatmapId=5880809）← MWC 4K 2026F RC6

## ADP

### 文件缺失且身份无法确认（8 条）

- `maps/4-digit-osumania-world-cup-2023/round-6/RC3.osz`（no-bid，beatmapId=无）← 4DM2023F RC3
- `maps/4-digit-osumania-world-cup-2023/round-7/RC6.osz`（no-bid，beatmapId=无）← 4DM2023GF RC6
- `maps/gb-cup-2026-in-real-life/round-2/RC6.osz`（ambiguous-bid，beatmapId=5768791）← GBC 2026 IRLRO16 RC6
- `maps/mexico-mania-tournament-4k-2026/round-5/RC7.osz`（ambiguous-bid，beatmapId=5743674）← MMT 2026F RC7
- `maps/osumania-4k-world-cup-2023/round-3/RC6.osz`（ambiguous-bid，beatmapId=4256058）← MWC 4K 2023RO16 RC6
- `maps/osumania-4k-world-cup-2023/round-4/RC4.osz`（ambiguous-bid，beatmapId=4284901）← MWC 4K 2023QF RC4
- `maps/osumania-4k-world-cup-2023/round-6/RC5.osz`（ambiguous-bid，beatmapId=4303210）← MWC 4K 2023F RC5
- `maps/south-korean-winter-tournament/round-3/RC3.osz`（ambiguous-bid，beatmapId=5494777）← SKWTQF RC3

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `c7cb3d73fb593382`
  - **meta:yzyx|dysnomia|0dz0|paradise lost**：`maps/asia-suiji-cup-2025/round-6/RC5.osz` ← ASC 2025GF RC5
  - **bid:4942998**：`maps/korean-extraterrestrials-tournament-2/round-2/RC4.osz` ← KET2RO16 RC4

## STC

### 文件缺失且身份无法确认（6 条）

- `maps/4-digit-osumania-world-cup-2023/round-7/RC4.osz`（no-bid，beatmapId=无）← 4DM2023GF RC4
- `maps/4-digit-osumania-world-cup-2024/round-3/RC4.osz`（ambiguous-bid，beatmapId=4416050）← 4DM 2024RO16 RC4
- `maps/osumania-4k-chilean-national-cup-2025/round-5/RC6.osz`（ambiguous-bid，beatmapId=4984345）← MCLT 4K 2025F RC6
- `maps/osumania-4k-world-cup-2023/round-1/RC1.osz`（ambiguous-bid，beatmapId=4253751）← MWC 4K 2023Qual RC1
- `maps/osumania-4k-world-cup-2023/round-2/RC1.osz`（ambiguous-bid，beatmapId=4157435）← MWC 4K 2023RO32 RC1
- `maps/osumania-4k-world-cup-2023/round-4/RC5.osz`（ambiguous-bid，beatmapId=4284906）← MWC 4K 2023QF RC5

## MTC

### 文件缺失且身份无法确认（4 条）

- `maps/4-digit-osumania-world-cup-2023/round-6/RC5.osz`（no-bid，beatmapId=无）← 4DM2023F RC5
- `maps/gb-cup-2026-in-real-life/round-2/RC5.osz`（ambiguous-bid，beatmapId=3532510）← GBC 2026 IRLRO16 RC5
- `maps/osumania-4k-world-cup-2023/round-3/RC4.osz`（ambiguous-bid，beatmapId=4276109）← MWC 4K 2023RO16 RC4
- `maps/south-korean-winter-tournament/round-2/RC3.osz`（ambiguous-bid，beatmapId=5485213）← SKWTRO16 RC3

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `4cfb880edae4454b`
  - **meta:memme|acid burst|hna|nuclear**：`maps/asia-suiji-cup-2025/round-5/RC5.osz` ← ASC 2025F RC5
  - **bid:4310401**：`maps/osumania-chilean-tournament-4k-2026/round-3/RC6.osz` ← MCLT 4K 2026QF RC6

## JTC

### 文件缺失且身份无法确认（3 条）

- `maps/4-digit-osumania-world-cup-2023/round-5/RC6.osz`（no-bid，beatmapId=无）← 4DM2023SF RC6
- `maps/4-digit-osumania-world-cup-2024/round-4/RC4.osz`（ambiguous-bid，beatmapId=4471816）← 4DM 2024QF RC4
- `maps/osumania-4k-world-cup-2026/round-6/RC7.osz`（ambiguous-bid，beatmapId=5881271）← MWC 4K 2026F RC7

## WTC

### 文件缺失且身份无法确认（3 条）

- `maps/osumania-4k-world-cup-2023/round-6/RC7.osz`（ambiguous-bid，beatmapId=4303205）← MWC 4K 2023F RC7
- `maps/osumania-4k-world-cup-2023/round-7/RC5.osz`（ambiguous-bid，beatmapId=4311169）← MWC 4K 2023GF RC5
- `maps/osumania-4k-world-cup-2026/round-6/RC8.osz`（ambiguous-bid，beatmapId=5880813）← MWC 4K 2026F RC8

## TC

### 文件缺失且身份无法确认（9 条）

- `maps/4-digit-osumania-world-cup-2023/round-6/RC4.osz`（no-bid，beatmapId=无）← 4DM2023F RC4
- `maps/gb-cup-2026-in-real-life/round-1/ST3.osz`（ambiguous-bid，beatmapId=5754257）← GBC 2026 IRLQual ST3
- `maps/japanese-mania-championship-2/round-5/RC8(SV).osz`（ambiguous-bid，beatmapId=4635673）← JMC2SF RC8(SV)
- `maps/japanese-mania-championship-3/round-7/RC1.osz`（no-bid，beatmapId=无）← JMC3GF RC1
- `maps/osumania-4k-world-cup-2023/round-1/RC3.osz`（ambiguous-bid，beatmapId=4253740）← MWC 4K 2023Qual RC3
- `maps/osumania-4k-world-cup-2023/round-2/RC5.osz`（ambiguous-bid，beatmapId=4267958）← MWC 4K 2023RO32 RC5
- `maps/osumania-4k-world-cup-2023/round-7/RC7.osz`（ambiguous-bid，beatmapId=4311928）← MWC 4K 2023GF RC7
- `maps/osumania-4k-world-cup-2026/round-6/RC5.osz`（ambiguous-bid，beatmapId=5880806）← MWC 4K 2026F RC5
- `maps/soundwave-mania-2/round-2/RC3.osz`（ambiguous-bid，beatmapId=4856819）← SWM2RO64 RC3

## HB1

### 文件缺失且身份无法确认（11 条）

- `maps/gb-cup-2026-in-real-life/round-1/ST7.osz`（ambiguous-bid，beatmapId=5754258）← GBC 2026 IRLQual ST7
- `maps/gb-cup-2026-in-real-life/round-2/HB1.osz`（ambiguous-bid，beatmapId=3771938）← GBC 2026 IRLRO16 HB1
- `maps/japanese-mania-championship-2/round-5/HB4(Wild&SV).osz`（ambiguous-bid，beatmapId=4635642）← JMC2SF HB4(Wild&SV)
- `maps/osumania-4k-chilean-national-cup-2025/round-5/HB1.osz`（ambiguous-bid，beatmapId=4981878）← MCLT 4K 2025F HB1
- `maps/osumania-4k-world-cup-2023/round-1/HB2.osz`（ambiguous-bid，beatmapId=4253513）← MWC 4K 2023Qual HB2
- `maps/osumania-4k-world-cup-2023/round-4/HB1.osz`（ambiguous-bid，beatmapId=4284664）← MWC 4K 2023QF HB1
- `maps/osumania-4k-world-cup-2023/round-5/HB1.osz`（ambiguous-bid，beatmapId=4294725）← MWC 4K 2023SF HB1
- `maps/osumania-4k-world-cup-2023/round-6/HB1.osz`（ambiguous-bid，beatmapId=4303025）← MWC 4K 2023F HB1
- `maps/osumania-4k-world-cup-2026/round-6/HB1.osz`（ambiguous-bid，beatmapId=5880820）← MWC 4K 2026F HB1
- `maps/south-korean-winter-tournament/round-2/HB2.osz`（ambiguous-bid，beatmapId=5489080）← SKWTRO16 HB2
- `maps/two-shot-cup-2/round-7/GM1.osz`（ambiguous-bid，beatmapId=5329263）← TSC2SF GM1

### 内容摘要相同、但身份来源不同（2 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `3b038ca4cf3a08cb`
  - **meta:kamikoto|sabotage|v1do-|dismantle**：`maps/asia-suiji-cup-2025/round-5/HB1.osz` ← ASC 2025F HB1
  - **bid:5416946**：`maps/osumania-chilean-tournament-4k-2026/round-3/HB1.osz` ← MCLT 4K 2026QF HB1
- 摘要 `e9e383046744f1c4`
  - **meta:lime|pixel planet|saemitsu|traversing the cosmos**：`maps/asia-suiji-cup-2025/round-4/HB1.osz` ← ASC 2025SF HB1
  - **bid:4615369**：`maps/coe-2026-mania-tournament/round-2/HB2.osz` ← COEMTRO16&QF HB2 ／ `maps/coe-2026-mania-tournament/round-3/HB2.osz` ← COEMTSF&F HB2 ／ `maps/vietnamese-rewind-mania-championship/round-4/HB1.osz` ← VRMCSF HB1

## HB2

### 文件缺失且身份无法确认（9 条）

- `maps/4-digit-osumania-world-cup-2024/round-7/HB4.osz`（ambiguous-bid，beatmapId=4498901）← 4DM 2024GF HB4
- `maps/gb-cup-2026-in-real-life/round-1/ST6.osz`（ambiguous-bid，beatmapId=5754064）← GBC 2026 IRLQual ST6
- `maps/gb-cup-2026-in-real-life/round-2/HB2.osz`（ambiguous-bid，beatmapId=3997461）← GBC 2026 IRLRO16 HB2
- `maps/japanese-mania-championship-2/round-4/HB4(SV).osz`（ambiguous-bid，beatmapId=4625117）← JMC2QF HB4(SV)
- `maps/japanese-mania-championship-2/round-6/HB4(SV).osz`（ambiguous-bid，beatmapId=4653956）← JMC2F HB4(SV)
- `maps/osumania-4k-world-cup-2023/round-2/HB1.osz`（ambiguous-bid，beatmapId=4266313）← MWC 4K 2023RO32 HB1
- `maps/osumania-4k-world-cup-2023/round-4/HB2.osz`（ambiguous-bid，beatmapId=4284920）← MWC 4K 2023QF HB2
- `maps/osumania-4k-world-cup-2023/round-6/HB2.osz`（ambiguous-bid，beatmapId=4303097）← MWC 4K 2023F HB2
- `maps/osumania-4k-world-cup-2026/round-6/HB2.osz`（ambiguous-bid，beatmapId=5880712）← MWC 4K 2026F HB2

## HB3

### 同 BID / 同元数据但内容不同（已阻止合并）

- **bid:4417278**（same-bid-different-content）
  - 内容摘要 `a0ab89095dcee5c4`：`maps/osu-philippines-nationals-2025-osumania-4k/round-6/HB3.osz` ← PHNM2025GF HB3
  - 内容摘要 `75670ba698dc5c8d`：`maps/osumania-4k-chinese-national-cup-2024/round-7/HB3.osz` ← MCNC 4K 2024SF HB3

### 文件缺失且身份无法确认（9 条）

- `maps/4-digit-osumania-world-cup-2024/round-7/HB3.osz`（ambiguous-bid，beatmapId=4498582）← 4DM 2024GF HB3
- `maps/gb-cup-2026-in-real-life/round-2/HB3.osz`（ambiguous-bid，beatmapId=5083833）← GBC 2026 IRLRO16 HB3
- `maps/mexico-mania-tournament-4k-2026/round-3/HB3.osz`（ambiguous-bid，beatmapId=5624202）← MMT 2026QF HB3
- `maps/osumania-4k-world-cup-2023/round-4/HB3.osz`（ambiguous-bid，beatmapId=4284700）← MWC 4K 2023QF HB3
- `maps/osumania-4k-world-cup-2023/round-7/HB2.osz`（ambiguous-bid，beatmapId=4311937）← MWC 4K 2023GF HB2
- `maps/osumania-4k-world-cup-2023/round-7/HB3.osz`（ambiguous-bid，beatmapId=4311938）← MWC 4K 2023GF HB3
- `maps/osumania-4k-world-cup-2026/round-6/HB3.osz`（ambiguous-bid，beatmapId=5880882）← MWC 4K 2026F HB3
- `maps/osumania-4k-world-cup-2026/round-6/HB4.osz`（ambiguous-bid，beatmapId=5880849）← MWC 4K 2026F HB4
- `maps/soundwave-mania-2/round-8/HB3.osz`（ambiguous-bid，beatmapId=5200301）← SWM2GF HB3

### 内容摘要相同、但身份来源不同（3 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `21662f26beef6e6c`
  - **bid:3958261**：`maps/osu-philippines-nationals-2025-osumania-4k/round-3/HB3.osz` ← PHNM2025QF HB3
  - **bid:5175748**：`maps/vietnamese-national-mania-championship-4k-2025/round-4/HB3.osz` ← VNMC 4K 2025QF HB3
- 摘要 `f0554cad29f7ce69`
  - **bid:5256894**：`maps/osumania-4k-chinese-national-cup-2025/round-7/HB3.osz` ← MCNC 4K 2025F HB3
  - **meta:false noise|kek|alptraum|pep**：`maps/the-third-impact/round-8/HB3.osz` ← TTIGF HB3
- 摘要 `f0e18ba5b5ed157b`
  - **meta:ichika nito|metaphor feat. feryquitous|imperialtrinity|expert | ethereal resonance.**：`maps/asia-suiji-cup-2025/round-6/HB2.osz` ← ASC 2025GF HB2
  - **bid:4994642**：`maps/osumania-4k-chilean-national-cup-2025/round-6/HB3.osz` ← MCLT 4K 2025GF HB3

## HB4

### 文件缺失且身份无法确认（3 条）

- `maps/osumania-4k-world-cup-2023/round-1/HB1.osz`（ambiguous-bid，beatmapId=4253493）← MWC 4K 2023Qual HB1
- `maps/osumania-4k-world-cup-2023/round-3/HB2.osz`（ambiguous-bid，beatmapId=4275868）← MWC 4K 2023RO16 HB2
- `maps/osumania-4k-world-cup-2023/round-7/HB1.osz`（ambiguous-bid，beatmapId=4269128）← MWC 4K 2023GF HB1

## RCmainHB

### 文件缺失且身份无法确认（1 条）

- `maps/osumania-4k-world-cup-2023/round-3/HB1.osz`（ambiguous-bid，beatmapId=4267194）← MWC 4K 2023RO16 HB1

## MXHB

### 文件缺失且身份无法确认（1 条）

- `maps/osumania-4k-world-cup-2023/round-2/HB2.osz`（ambiguous-bid，beatmapId=4266311）← MWC 4K 2023RO32 HB2

## MNTB

### 文件缺失且身份无法确认（3 条）

- `maps/japanese-mania-championship-2/round-7/HB4(sv).osz`（ambiguous-bid，beatmapId=4671476）← JMC2GF HB4(sv)
- `maps/roasted-duck-cup-2024/round-1/B-HB1.osz`（no-bid，beatmapId=无）← RDC 2024Qual B-HB1
- `maps/the-gb-cup-2024-spring/round-18/HB3.osz`（no-bid，beatmapId=无）← GBC 2024 SpringSF HB3

## RE

### 文件缺失且身份无法确认（3 条）

- `maps/4-digit-osumania-world-cup-2023/round-3/LN3.osz`（no-bid，beatmapId=无）← 4DM2023RO16 LN3
- `maps/osumania-4k-world-cup-2023/round-2/LN1.osz`（ambiguous-bid，beatmapId=4266234）← MWC 4K 2023RO32 LN1
- `maps/two-shot-cup-2/round-7/LN1.osz`（ambiguous-bid，beatmapId=5324003）← TSC2SF LN1

## CO

### 文件缺失且身份无法确认（8 条）

- `maps/4-digit-osumania-world-cup-2023/round-5/LN1.osz`（no-bid，beatmapId=无）← 4DM2023SF LN1
- `maps/gb-cup-2026-in-real-life/round-1/ST4.osz`（ambiguous-bid，beatmapId=5754539）← GBC 2026 IRLQual ST4
- `maps/osumania-4k-world-cup-2023/round-3/LN1.osz`（ambiguous-bid，beatmapId=4276106）← MWC 4K 2023RO16 LN1
- `maps/osumania-4k-world-cup-2023/round-4/LN1.osz`（ambiguous-bid，beatmapId=4284564）← MWC 4K 2023QF LN1
- `maps/osumania-4k-world-cup-2023/round-5/LN1.osz`（ambiguous-bid，beatmapId=4294615）← MWC 4K 2023SF LN1
- `maps/osumania-4k-world-cup-2023/round-5/LN3.osz`（ambiguous-bid，beatmapId=4294101）← MWC 4K 2023SF LN3
- `maps/osumania-4k-world-cup-2023/round-6/LN1.osz`（ambiguous-bid，beatmapId=4303080）← MWC 4K 2023F LN1
- `maps/the-gb-cup-2024-spring/round-4/LN.osz`（no-bid，beatmapId=无）← GBC 2024 SpringB-4 LN

## TE

### 同 BID / 同元数据但内容不同（已阻止合并）

- **bid:4275303**（same-bid-different-content）
  - 内容摘要 `41d2095af167b9a3`：`maps/cat-yum-cup/round-4/LN1.osz` ← CYCRO16 LN1
  - 内容摘要 `3d680cbb2532143e`：`maps/the-gb-cup-2024-spring/round-18/LN1.osz` ← GBC 2024 SpringSF LN1

### 文件缺失且身份无法确认（2 条）

- `maps/4-digit-osumania-world-cup-2023/round-7/LN1.osz`（no-bid，beatmapId=无）← 4DM2023GF LN1
- `maps/osumania-4k-world-cup-2026/round-6/LN1.osz`（ambiguous-bid，beatmapId=5880777）← MWC 4K 2026F LN1

## DE

### 文件缺失且身份无法确认（16 条）

- `maps/4-digit-osumania-world-cup-2023/round-1/LN2.osz`（no-bid，beatmapId=无）← 4DM2023Qual LN2
- `maps/4-digit-osumania-world-cup-2023/round-3/LN2.osz`（no-bid，beatmapId=无）← 4DM2023RO16 LN2
- `maps/4-digit-osumania-world-cup-2023/round-4/LN2.osz`（no-bid，beatmapId=无）← 4DM2023QF LN2
- `maps/4-digit-osumania-world-cup-2023/round-7/LN2.osz`（no-bid，beatmapId=无）← 4DM2023GF LN2
- `maps/gb-cup-2026-in-real-life/round-1/ST5.osz`（ambiguous-bid，beatmapId=5754282）← GBC 2026 IRLQual ST5
- `maps/osumania-4k-world-cup-2023/round-1/LN2.osz`（ambiguous-bid，beatmapId=4253649）← MWC 4K 2023Qual LN2
- `maps/osumania-4k-world-cup-2023/round-2/LN2.osz`（ambiguous-bid，beatmapId=4266309）← MWC 4K 2023RO32 LN2
- `maps/osumania-4k-world-cup-2023/round-3/LN2.osz`（ambiguous-bid，beatmapId=4276104）← MWC 4K 2023RO16 LN2
- `maps/osumania-4k-world-cup-2023/round-4/LN2.osz`（ambiguous-bid，beatmapId=4284669）← MWC 4K 2023QF LN2
- `maps/osumania-4k-world-cup-2023/round-5/LN2.osz`（ambiguous-bid，beatmapId=4294641）← MWC 4K 2023SF LN2
- `maps/osumania-4k-world-cup-2023/round-6/LN2.osz`（ambiguous-bid，beatmapId=4303115）← MWC 4K 2023F LN2
- `maps/osumania-4k-world-cup-2023/round-7/LN2.osz`（ambiguous-bid，beatmapId=4311944）← MWC 4K 2023GF LN2
- `maps/osumania-4k-world-cup-2026/round-6/LN2.osz`（ambiguous-bid，beatmapId=5881221）← MWC 4K 2026F LN2
- `maps/roasted-duck-cup-2024/round-1/A-LN2.osz`（ambiguous-bid，beatmapId=4702305）← RDC 2024Qual A-LN2
- `maps/roasted-duck-cup-2024/round-4/A-LN2.osz`（ambiguous-bid，beatmapId=4750412）← RDC 2024GF A-LN2
- `maps/the-gb-cup-2024-spring/round-18/LN2.osz`（no-bid，beatmapId=无）← GBC 2024 SpringSF LN2

### 内容摘要相同、但身份来源不同（2 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `bcf955e75fcb357f`
  - **meta:dj totto|dornwald ~junge~|stupud man|anima**：`maps/asia-suiji-cup-2025/round-2/LN2.osz` ← ASC 2025RO16 LN2
  - **bid:3391262**：`maps/hlc-season3/round-3/LN2.osz` ← HLC S3R2 LN2
- 摘要 `d74dae8ffc02cd39`
  - **bid:5318899**：`maps/osumania-ln-tournament-4/round-3/DE1.osz` ← o!mLN4RO32 DE1
  - **meta:endorfin.|luminous rage|[crz]crysarlene|patu rage**：`maps/osumania-ln-tournament-4/round-4/DE1.osz` ← o!mLN4RO16 DE1

## JW

### 文件缺失且身份无法确认（1 条）

- `maps/osumania-4k-world-cup-2023/round-6/LN4.osz`（ambiguous-bid，beatmapId=4303089）← MWC 4K 2023F LN4

## SW

### 同 BID / 同元数据但内容不同（已阻止合并）

- **bid:4775997**（same-bid-different-content）
  - 内容摘要 `57b7a982b17c2598`：`maps/gb-cup-2026-in-real-life/round-3/LN4.osz` ← GBC 2026 IRLQF LN4
  - 内容摘要 `0b90c5e7577db606`：`maps/osumania-4k-world-cup-2024/round-5/LN4.osz` ← MWC 4K 2024SF LN4

### 文件缺失且身份无法确认（1 条）

- `maps/gb-cup-2026-in-real-life/round-2/LN3.osz`（ambiguous-bid，beatmapId=4723728）← GBC 2026 IRLRO16 LN3

## LNMX

### 文件缺失且身份无法确认（7 条）

- `maps/japanese-mania-championship-2/round-4/LN3(SV).osz`（ambiguous-bid，beatmapId=4625110）← JMC2QF LN3(SV)
- `maps/japanese-mania-championship-2/round-5/LN4(SV).osz`（ambiguous-bid，beatmapId=4635666）← JMC2SF LN4(SV)
- `maps/japanese-mania-championship-2/round-7/LN4(SV).osz`（ambiguous-bid，beatmapId=4672888）← JMC2GF LN4(SV)
- `maps/osumania-4k-chilean-national-cup-2025/round-3/LN3.osz`（ambiguous-bid，beatmapId=4964356）← MCLT 4K 2025QF LN3
- `maps/osumania-4k-world-cup-2023/round-4/LN3.osz`（ambiguous-bid，beatmapId=4284918）← MWC 4K 2023QF LN3
- `maps/osumania-4k-world-cup-2023/round-6/LN3.osz`（ambiguous-bid，beatmapId=4303094）← MWC 4K 2023F LN3
- `maps/osumania-4k-world-cup-2023/round-7/LN3.osz`（ambiguous-bid，beatmapId=4138053）← MWC 4K 2023GF LN3

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `d3e67ca9734a644d`
  - **meta:demetori|last remote ~ type a personality|castella|requiem of koishi od7**：`maps/asia-suiji-cup-2025/round-6/LN5.osz` ← ASC 2025GF LN5
  - **bid:4276650**：`maps/touhou-project-mania-cup-4th/round-7/LNX.osz` ← THMC 4F LNX

## LNWC

### 文件缺失且身份无法确认（3 条）

- `maps/japanese-mania-championship-2/round-6/LN4(SV).osz`（ambiguous-bid，beatmapId=4654005）← JMC2F LN4(SV)
- `maps/osumania-4k-world-cup-2023/round-2/LN3.osz`（ambiguous-bid，beatmapId=3867039）← MWC 4K 2023RO32 LN3
- `maps/osumania-4k-world-cup-2026/round-6/LN3.osz`（ambiguous-bid，beatmapId=5880862）← MWC 4K 2026F LN3

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `63b9aa7fb945522d`
  - **meta:dr. dre & snoop dogg|the next episode (san holo remix) (cut ver.)|epic man 2|noodle it like it's hot**：`maps/osumania-ln-tournament-4/round-3/WC3.osz` ← o!mLN4RO32 WC3
  - **bid:5328503**：`maps/osumania-ln-tournament-4/round-4/WC3.osz` ← o!mLN4RO16 WC3

## LNTC

### 文件缺失且身份无法确认（4 条）

- `maps/china-osumania-4k-intermidiate-tournament-2026/round-5/LN3.osz`（no-bid，beatmapId=无）← CMIT 4K 2026SF LN3
- `maps/osumania-4k-world-cup-2023/round-5/LN4.osz`（ambiguous-bid，beatmapId=4294634）← MWC 4K 2023SF LN4
- `maps/osumania-4k-world-cup-2023/round-7/LN4.osz`（ambiguous-bid，beatmapId=4311951）← MWC 4K 2023GF LN4
- `maps/osumania-4k-world-cup-2026/round-6/LN4.osz`（ambiguous-bid，beatmapId=5880867）← MWC 4K 2026F LN4

### 内容摘要相同、但身份来源不同（1 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `25d34eff2076a1c4`
  - **meta:sakuzyo feat. enoa (cv: hikaru tono)|nottonotice();|saemitsu|// desiretocomprehend();**：`maps/asia-suiji-cup-2025/round-5/LN3.osz` ← ASC 2025F LN3
  - **bid:5338306**：`maps/osumania-ln-tournament-4/round-5/TE1.osz` ← o!mLN4QF TE1

## SV1

### 文件缺失且身份无法确认（2 条）

- `maps/osumania-4k-world-cup-2023/round-6/SV2.osz`（ambiguous-bid，beatmapId=4303120）← MWC 4K 2023F SV2
- `maps/osumania-4k-world-cup-2023/round-7/SV1.osz`（ambiguous-bid，beatmapId=4311956）← MWC 4K 2023GF SV1

## SI

### 文件缺失且身份无法确认（4 条）

- `maps/4-digit-osumania-world-cup-2023/round-6/SV2.osz`（no-bid，beatmapId=无）← 4DM2023F SV2
- `maps/osumania-4k-world-cup-2023/round-2/SV1.osz`（ambiguous-bid，beatmapId=4266321）← MWC 4K 2023RO32 SV1
- `maps/po-fang-cup-s3/round-1/SV1.osz`（no-bid，beatmapId=无）← PFC S3Qual SV1
- `maps/soundwave-mania-2/round-4/SV1.osz`（ambiguous-bid，beatmapId=4985080）← SWM2RO16 SV1

## ME

### 文件缺失且身份无法确认（4 条）

- `maps/osumania-4k-world-cup-2023/round-4/SV1.osz`（ambiguous-bid，beatmapId=4284932）← MWC 4K 2023QF SV1
- `maps/osumania-4k-world-cup-2023/round-5/SV2.osz`（ambiguous-bid，beatmapId=4294649）← MWC 4K 2023SF SV2
- `maps/osumania-4k-world-cup-2023/round-6/SV1.osz`（ambiguous-bid，beatmapId=4303108）← MWC 4K 2023F SV1
- `maps/osumania-4k-world-cup-2023/round-7/SV2.osz`（ambiguous-bid，beatmapId=4311995）← MWC 4K 2023GF SV2

## SVMX

### 文件缺失且身份无法确认（4 条）

- `maps/japanese-mania-championship-3/round-3/SV1.osz`（no-bid，beatmapId=无）← JMC3RO16 SV1
- `maps/malody-4k-team-cup-2025/round-6/SV1.osz`（no-bid，beatmapId=无）← MKTC 2025F SV1
- `maps/osumania-4k-world-cup-2023/round-2/SV2.osz`（ambiguous-bid，beatmapId=4266332）← MWC 4K 2023RO32 SV2
- `maps/osumania-4k-world-cup-2023/round-3/SV1.osz`（ambiguous-bid，beatmapId=4276089）← MWC 4K 2023RO16 SV1

## GM

### 文件缺失且身份无法确认（1 条）

- `maps/osumania-4k-world-cup-2023/round-4/SV2.osz`（ambiguous-bid，beatmapId=4284940）← MWC 4K 2023QF SV2

## TB

### 文件缺失且身份无法确认（8 条）

- `maps/osumania-4k-chilean-national-cup-2025/round-2/TB.osz`（ambiguous-bid，beatmapId=4952628）← MCLT 4K 2025RO16 TB
- `maps/osumania-4k-world-cup-2023/round-2/TB.osz`（ambiguous-bid，beatmapId=4266340）← MWC 4K 2023RO32 TB
- `maps/osumania-4k-world-cup-2023/round-3/TB.osz`（ambiguous-bid，beatmapId=3917445）← MWC 4K 2023RO16 TB
- `maps/osumania-4k-world-cup-2023/round-4/TB.osz`（ambiguous-bid，beatmapId=4284926）← MWC 4K 2023QF TB
- `maps/osumania-4k-world-cup-2023/round-5/TB.osz`（ambiguous-bid，beatmapId=4294726）← MWC 4K 2023SF TB
- `maps/osumania-4k-world-cup-2023/round-6/TB.osz`（ambiguous-bid，beatmapId=4303123）← MWC 4K 2023F TB
- `maps/osumania-4k-world-cup-2023/round-7/TB.osz`（ambiguous-bid，beatmapId=4312004）← MWC 4K 2023GF TB
- `maps/osumania-4k-world-cup-2026/round-6/TB.osz`（ambiguous-bid，beatmapId=5880868）← MWC 4K 2026F TB

### 内容摘要相同、但身份来源不同（2 组，只报告、未改动打包结果）

判据：内容摘要（Mode + [Difficulty] + [TimingPoints] + [HitObjects]）逐字节等价，
但候选键不同（一个有 BID / 一个用元数据 / 各自独立）→ 当前实现不会合并，两个条目各占一个位置。
是否值得改成"按内容合并"要看这里的规模与人工判断（合并会动包内条目数与 manifest.mapCount）。

- 摘要 `e7b338cf9e08c023`
  - **bid:3541325**：`maps/osu-philippines-nationals-2025-osumania-4k/round-3/TB.osz` ← PHNM2025QF TB
  - **bid:5505340**：`maps/south-korean-winter-tournament/round-4/TB.osz` ← SKWTSF TB
- 摘要 `605126f2bc5d0f88`（NSV）
  - **bid:4635661**：`maps/japanese-mania-championship-2/round-5/TB.nsv.osz` ← JMC2SF TB
  - **bid:4635660**：`maps/osumania-4k-chinese-national-cup-2025/round-4/TB1.nsv.osz` ← MCNC 4K 2025RO16 TB1

