# 可疑 beatmapId / beatmapsetId（自动检测，只读）

生成时间：2026-09-18T12:49:17.461Z
扫描目录：`data/tournaments` · 谱面 4935 张

> 口径：**0 / 1 / 负数一律视为占位或未提交**（与 `src/lib/beatmapIds.ts` 同一实现）。
> 「同一 setId 挂 ≥3 首不同的歌」= 这个 id 不可靠。

## 总览

- **占位 ID**：0 条
- **不可靠的 setId**：0 组（共 0 条记录）
- **同一 bid 挂多首不同的歌**：8 组

## 1. 占位 ID（0 / 1 / 负数）

（无）

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
