/** @type {import('tailwindcss').Config} */
// 颜色、玻璃材质、动效都在 src/index.css 的 CSS 变量里；Tailwind 只负责布局工具类。
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
