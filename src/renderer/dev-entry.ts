/**
 * dev.html 入口（Task 2；浏览器模拟环境，生产 care.html 不加载）
 *
 * 先装 mock window.damp，再动态加载真实护理台 care.ts —— 模拟环境跑的就是
 * 正式界面。用动态 import 保证顺序：构建产物里静态 import 会被拼接提前求值，
 * care 的首次 status() 会跑在 mock 安装之前（构建预览实测到的报错）。
 */
import './dev/mock-entry';

void import('./care');
