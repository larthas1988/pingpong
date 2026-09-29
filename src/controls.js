/**
 * 输入控制：鼠标 / 触摸拖动
 *
 * 输出两个归一化值（范围 -1 ~ 1）：
 *   - x: 左右移动（控制球拍横向位置）
 *   - y: 上下移动（控制球拍高度，向上=更高）
 *
 * 采用「绝对位置」映射：指针在屏幕上的位置直接对应球拍位置，
 * 这样玩家可以直观地把球拍移到球所在的高度去接球。
 *
 * 移动端说明：
 *   - 使用 pointer 事件统一处理鼠标与触摸，避免 touch/mouse 双触发
 *   - touch-action: none 阻止浏览器手势（滚动/缩放）抢占触摸
 */

export class InputController {
  constructor(domElement) {
    this.dom = domElement;
    this.x = 0;
    this.y = 0;

    this._pointerActive = false;
    // 指针的绝对归一化位置（0~1），默认居中
    this._pointerNorm = { x: 0.5, y: 0.5 };
    this._hasPointer = false;

    this._bindEvents();
  }

  _bindEvents() {
    const dom = this.dom;

    const onDown = (e) => {
      this._pointerActive = true;
      // 捕获指针，保证手指移出元素后仍能持续接收事件
      if (dom.setPointerCapture && e.pointerId !== undefined) {
        try {
          dom.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 忽略捕获失败 */
        }
      }
      this._updatePointer(e);
    };

    const onMove = (e) => {
      // 桌面端鼠标移动无需按下也生效；移动端仅在触摸时更新
      if (e.pointerType === "mouse" || this._pointerActive) {
        this._updatePointer(e);
      }
    };

    const onUp = (e) => {
      this._pointerActive = false;
      if (dom.releasePointerCapture && e.pointerId !== undefined) {
        try {
          dom.releasePointerCapture(e.pointerId);
        } catch (err) {
          /* 忽略释放失败 */
        }
      }
    };

    // 统一使用 pointer 事件（同时覆盖鼠标与触摸）
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onUp);

    // 阻止移动端默认手势与右键菜单，避免干扰拖动
    dom.addEventListener("touchstart", (e) => e.preventDefault(), {
      passive: false,
    });
    dom.addEventListener("touchmove", (e) => e.preventDefault(), {
      passive: false,
    });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** 将指针像素坐标转换为 0~1 的归一化坐标 */
  _updatePointer(e) {
    const rect = this.dom.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // 竖屏旋转 90° 时，canvas 的 getBoundingClientRect 仍是旋转后的包围盒，
    // 直接用 clientX/Y 会错位。这里检测旋转状态并做坐标逆变换。
    let nx, ny;
    if (this._isRotated()) {
      // 旋转 90°：屏幕 y -> 画布 x，屏幕 x -> 画布 y（反向）
      nx = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      ny = clamp(1 - (e.clientX - rect.left) / rect.width, 0, 1);
    } else {
      nx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      ny = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    }

    this._pointerNorm = { x: nx, y: ny };
    this._hasPointer = true;
  }

  /** 判断 #app 是否处于竖屏旋转状态 */
  _isRotated() {
    const app = document.getElementById("app");
    return !!app && app.style.transform.includes("rotate");
  }

  /**
   * 获取当前控制值
   * 指针绝对位置映射到 -1 ~ 1
   *   x: 屏幕左 -> -1，屏幕右 -> +1
   *   y: 屏幕下 -> -1，屏幕上 -> +1（与游戏坐标系一致）
   */
  getValues() {
    const x = clamp((this._pointerNorm.x - 0.5) * 2, -1, 1);
    const y = clamp((0.5 - this._pointerNorm.y) * 2, -1, 1);

    return { x, y };
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}