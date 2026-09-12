import assert from 'node:assert/strict'
import test from 'node:test'

import { linearRegression, linearRegressionWithSlope } from '../src/lib/difficultyFit.ts'

// R18:常数样本(总方差为 0)时 R² 未定义 → null(N/A),不再假装"完美拟合";
// 同时不对负 R² 做 max(0, ·) 截断。
const constantPoints = [
  { x: 0, y: 5 },
  { x: 1, y: 5 },
]

test('R18 常数样本 + 固定斜率 2:R² 为 null,但 RMSE 与既有口径不变', () => {
  const fit = linearRegressionWithSlope(constantPoints, 2)
  assert.ok(fit)
  assert.equal(fit.rSquared, null)
  assert.equal(fit.slope, 2)
  assert.equal(fit.rmse, 1) // 两点各差 1
  assert.equal(fit.predict(0), 4) // intercept = 5 - 2*0.5 = 4
  assert.equal(fit.sampleCount, 2)
})

test('R18 常数样本 + 精确预测:R² 仍为 null(样本本身无方差可言)', () => {
  const fit = linearRegressionWithSlope(constantPoints, 0)
  assert.ok(fit)
  assert.equal(fit.rSquared, null)
  assert.equal(fit.rmse, 0)
})

test('R18 最小二乘拟合遇到常数样本同样返回 null', () => {
  const fit = linearRegression(constantPoints)
  assert.ok(fit)
  assert.equal(fit.rSquared, null)
  assert.equal(fit.slope, 0) // 分子为 0 → 斜率 0
})

test('R18 非恒定样本允许负 R²,不被截断为 0', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]
  // 强制 slope=-1 比"直接用均值预测"差得多:totalSum=5,residualSum=20 → R²=-3
  const fit = linearRegressionWithSlope(points, -1)
  assert.ok(fit)
  assert.equal(fit.rSquared, -3)
})

test('R18 普通样本的 R² 与截距/预测保持不变', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
  ]
  const fit = linearRegression(points)
  assert.ok(fit)
  assert.equal(fit.rSquared, 1)
  assert.equal(fit.slope, 1)
  assert.equal(fit.intercept, 0)
  assert.equal(fit.predict(5), 5)
})
