import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// ESLint 9 flat config（R19）。
//
// Next 16 已移除 `next lint`（实测它会把 "lint" 当成目录去扫，直接报错），
// 所以改用 ESLint CLI。eslint-config-next 16 自身导出的就是 flat config 数组，
// 直接展开即可，不需要 @eslint/eslintrc 的 FlatCompat。
//
// 预设选 core-web-vitals：它 = base 的全套 react/react-hooks/import/jsx-a11y/@next/next
// 规则 + 一组 Next 专属规则，是 Next 官方对应用推荐的预设。
//
// 下面的 ignores 只声明"扫描范围"，不关任何规则 —— 存量问题要记录基线后小步修，
// 不允许用大范围禁规则的方式把报告刷绿。
const config = [
  {
    ignores: [
      // 构建产物与生成物
      '.next/**',
      'out/**',
      'build/**',
      'output/**',
      'src/generated/**',
      'reports/**',
      // 本地/工具临时目录
      '.workbuddy/**',
      '.wrangler/**',
      // 工作区自带的第三方工具：留在磁盘上，但不属于本仓库源码
      //（.gitignore 已声明不纳入版本管理）。里面有上百个已压缩的 js，
      // 必须排除，否则 lint 会去扫用户目录。
      'ManiaMapAnalyser.by.Leo_Black/**',
      'osu-toolbox/**',
    ],
  },
  ...nextCoreWebVitals,
]

export default config
