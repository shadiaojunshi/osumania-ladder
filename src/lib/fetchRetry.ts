// 网络层失败的重试。
//
// 浏览器把"连接被重置 / 流被中断 / DNS 失败 / 到达上游前就被掐断"这类问题统一抛成
// `TypeError: Failed to fetch`,没有状态码可看。搬运 .osz(单个几 MB~几十 MB)时它偶发出现,
// 立刻重试往往就成功 —— 用户看到的就是"一堆行同一句报错,重跑一次又全好了"。
//
// 这里只对"网络层抛错"做几次退避重试;**HTTP 状态码一律原样交回调用方**判断
// (不猜、不掩盖真实错误)。上传路径本来就有自己的重试,这个工具主要给下载/元数据这类
// 目前完全没有重试的调用用。

/** 浏览器/undici 的网络失败都是 TypeError(如 "Failed to fetch" / "fetch failed")。 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError
}

/** 429 与 5xx 属于"可能过一会儿就好";4xx(除 429)才是确定性失败。 */
export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export interface FetchRetryOptions {
  /** 总尝试次数(含第一次),默认 3 */
  attempts?: number
  /** 退避基数,第 n 次失败后等 baseDelayMs * n,默认 600ms */
  baseDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  fetchImpl?: typeof fetch
}

/**
 * 用同一套退避策略重试任意异步操作,只在**网络层抛错**(TypeError)时重试。
 *
 * 存在的理由是把「发请求 + 读响应体」当成一个整体重试:`fetch` 在**收到响应头**时就
 * resolve 了,几十 MB 的 .osz 是之后才流完的 —— 传输中途断流抛的是同一个 TypeError,
 * 但它发生在 `await res.blob()` 里,那已经不在只包住 fetch 的那层重试范围内了。
 * 搬运大文件时这正是最常见的中断点,所以读取动作也必须能重试。
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  options: FetchRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 600)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isNetworkFailure(error) || attempt === attempts) break
      await sleep(baseDelayMs * attempt)
    }
  }
  throw lastError
}

/**
 * 与 fetch 同签名,只在**网络层抛错**时重试;返回任何 HTTP 响应(包括 4xx/5xx)都不重试。
 * 全部尝试都失败时抛出最后一次的错误(调用方用 isNetworkFailure 判断是不是网络问题)。
 *
 * 注意:它只保护"拿到响应头"这一步。要连响应体一起保护(下大文件),用 withNetworkRetry
 * 把读取包进去。
 */
export async function fetchWithNetworkRetry(
  input: string,
  init?: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch
  return withNetworkRetry(() => doFetch(input, init), options)
}
