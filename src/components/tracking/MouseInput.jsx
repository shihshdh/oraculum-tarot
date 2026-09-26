import { useMouseInput } from '../../hooks/useMouseInput';

/**
 * 鼠标输入适配器（无渲染，仅副作用）
 */
export default function MouseInput() {
  useMouseInput();
  return null;
}
