// 反馈建议的**唯一契约**（公开提交 Worker / 后台审核 API / 前端 三边共用）。
//
// 依据 docs/anonymous-feedback-and-abuse-plan.md 第 5 节。三条硬约束：
//  1. 纯类型 + 常量，**不依赖 React、不依赖 functions/** —— 公开 Worker 与 Pages 分开打包，
//     跨目录 import 会把后台的鉴权/KV 依赖拖进公开包。
//  2. 判别联合用 `kind` 区分三类建议，绝不把"改键型/改难度/改整轮参考"揉成一个宽松对象。
//  3. 客户端传来的任何身份字段（id / status / reviewerUid / commitSha）都不在这里定义 ——
//     它们只属于服务端的 SuggestRecord，收到就拒（见 validation.ts 的未知字段检查）。

export const SUGGESTION_SCHEMA_VERSION = 1

export type SuggestKind = 'slot.realType' | 'slot.difficulty' | 'round.reference'

/** Free text is reviewed manually; it can never become an automatic data patch. */
export interface TextProposal { kind: 'text'; message: string; target?: SuggestTarget }

export interface SuggestTarget {
  tournamentId: string
  roundId: string
  /** 轮次级建议（round.reference）不带 slot。 */
  slot?: string
  /**
   * 提交时看到的 BID 快照。采纳时用来核对"还是不是同一张图"，
   * 用来**提示冲突**，不是可信授权 —— 真正的核对必须读 GitHub 上的权威文件（见方案第 7 节）。
   */
  beatmapId?: number
}

/** 槽位难度：两类字段都可以给，至少给一个。0 不是"没填"（见 validation.ts 的规则）。 */
export interface SuggestDifficultyValue {
  difficulty?: number
  difficultyLn?: number
}

/**
 * 整轮参考的六个值。**0 是合法值**：沿用 RoundEditor.applyRoundRef 的语义，
 * 「> 0 才写」，0 = 这一项不动（不是"删成 0"）。SV 与 SPECIAL 永远不在这六个值里。
 */
export interface SuggestReferenceValue {
  rc: number
  hbRf: number
  hbLn: number
  ln: number
  tbRf: number
  tbLn: number
}

/** Target round + global ladder offset. The six submitted values are snapshots;
 * review shows those exact values and never silently substitutes a newer ladder. */
export interface SuggestReferenceSource {
  tournamentId: string
  roundId: string
  offset: number
}

export type SuggestProposal =
  | { kind: 'slot.realType'; target: SuggestTarget & { slot: string }; value: string }
  | { kind: 'slot.difficulty'; target: SuggestTarget & { slot: string }; value: SuggestDifficultyValue }
  | {
      kind: 'round.reference'
      target: SuggestTarget
      reference: SuggestReferenceSource
      value: SuggestReferenceValue
    }

/** 公开端点收到的完整提交（`POST /v1/suggestions`）。 */
export interface SuggestSubmission {
  schemaVersion: number
  /** UUID。同一次提交重试必须不变 —— 幂等靠它，不靠内容比对。 */
  clientRequestId: string
  /** 构建时注入的数据版本，只用于提示"你看到的是旧数据"。 */
  datasetVersion: string
  /** 相关目标字段的快照摘要，只用于冲突提示。 */
  baseFingerprint: string
  proposal: SuggestProposal | TextProposal
  /** 可选，≤500 字。整轮参考强烈提示补理由，但不强迫。 */
  reason?: string
  /** 首版不做文件上传：最多 2 个 https 证据链接，仅在界面上当外链展示。 */
  evidenceUrls?: string[]
  /** 可选昵称。**不是身份凭证**。 */
  alias?: string
  /** Turnstile token。服务端验证后即丢，不落盘。 */
  turnstileToken: string
}

/** 落盘时不含 turnstileToken（方案第 6 节：验证后不持久保存）。 */
export type SuggestStoredSubmission = Omit<SuggestSubmission, 'turnstileToken'>

export type SuggestStatus = 'pending' | 'staged' | 'applied' | 'ignored' | 'resolved'

/** unstage = 撤销暂存回 pending；applied 只能由 finalize 写入，不接受直接指定。 */
export type SuggestReviewAction = 'stage' | 'unstage' | 'ignore'

/** 服务端生成的字段，客户端一律不许传。 */
export interface SuggestRecord {
  id: string
  receivedAt: string
  /** 正文摘要：同一 clientRequestId 不同 payload 要判 409，靠它。 */
  payloadHash: string
  /** 只存加盐哈希，永不存原始 IP。 */
  ipHash: string
  status: SuggestStatus
  /** 审核状态用 compare-and-swap 更新，过期写要 409。 */
  revision: number
  submission: SuggestStoredSubmission
  reviewerUid?: string
  draftId?: string
  leaseExpiresAt?: string
  appliedCommitSha?: string
}

/** 提交被拒时对外统一的形状（不回显内部字段名以外的任何服务端信息）。 */
export interface SuggestRejection {
  ok: false
  code: 'BAD_REQUEST' | 'TOO_LARGE' | 'TURNSTILE_FAILED' | 'RATE_LIMITED' | 'DUPLICATE_CONFLICT' | 'INTERNAL' | 'DISABLED' | 'BUDGET_EXHAUSTED'
  errors: { field: string; code: string; message: string }[]
}
