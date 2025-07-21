/**
 * 文本拆分
 * 1. 流程：
 * 递归遍历dom树
 *   - 若为纯文本节点，二分分割
 *   - 若为元素节点，递归处理子节点
 *   每个节点分割后，返回{left, move}结构的新节点，用于构建新节点，没有则为null
 * 2.tips
 *  1. getBoundingClientRect是受transform缩放影响的，offsetHeight不是
 *  2. selectRange只有getBoundingClientRect
 *  3. follow previous和next的元素只做位置迁移，不计算高度，认为不占位
 */
export default class TextSplit {
  // 常量
  // 允许误差
  HEIGHT_GAP = 0.001
  // 不可分割标签（大写）
  UNSPLIT_TAGS = []
  // 不可分割的类名
  UNSPLIT_CLASSES = ['MathJax', 'MathJax_Display'];
  // 跟随前一个元素的标签（大写）
  FOLLOW_PREVIOUS_TAGS = ["SCRIPT"];
  // 跟随前一个元素的类名
  FOLLOW_PREVIOUS_CLASSES = [];
  // 跟随后一个元素的标签（大写）
  FOLLOW_NEXT_TAGS = [];
  // 跟随后一个元素的类名
  FOLLOW_NEXT_CLASSES = ["MathJax_Preview"];
  // region 辅助函数
  getScale (node) {
    // 假设 node 是一个 DOM 元素引用
    const offsetHeight = node ? node.offsetHeight : 0
    return offsetHeight ? this.getHeight(node) / offsetHeight : 0
  }

  getNum (numval) {
    const num = parseFloat(numval)
    return isNaN(num) ? 0 : num
  }

  createRange (node) {
    const range = document.createRange()
    range.selectNodeContents(node)
    return range
  }

  /**
   * 判断是否纯文本节点-不带div的那种
   * @param node 目标节点
   */
  isTextNode (node) {
    // Node.TEXT_NODE = 3
    return node.nodeType === Node.TEXT_NODE
  }

  /** 计算到容器顶部的距离 */
  getTopOffset (container, node) {
    return node.getBoundingClientRect().top - container.getBoundingClientRect().top
  }

  /** 获取bound高度 */
  getHeight (target) {
    return target.getBoundingClientRect().height
  }
  isMatchTagOrClass (tags, classNames, target) {
    if (this.isTextNode(target)) {
      return false;
    }
    if (tags.includes(target.tagName.toUpperCase())) {
      return true
    }
    const classList = target.classList
    return classNames.findIndex(cls => classList.contains(cls)) >= 0

  }
  /** 判断是否可分割 */
  isUnsplitable (target) {
    return this.isMatchTagOrClass(this.UNSPLIT_TAGS, this.UNSPLIT_CLASSES, target);
  }

  isFollowPrevious (target) {
    return this.isMatchTagOrClass(this.FOLLOW_PREVIOUS_TAGS, this.FOLLOW_PREVIOUS_CLASSES, target);
  }

  isFollowNext (target) {
    return this.isMatchTagOrClass(this.FOLLOW_NEXT_TAGS, this.FOLLOW_NEXT_CLASSES, target);
  }

  /** 获取dom节点高度 */
  getNodeHeight (target) {
    return Math.max(this.getHeight(target), target.scrollHeight * this.getScale(target))
  }
  // endregion

  // region 功能函数
  timer = null

  /**
   * 节点内容分割入口
   * 分割前一个dom内容后，为dom和下一个dom重新赋值html
   * @param targets dom列表
   * @param html html文本
   */
  async splitText (source, target, html) {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    if (!source) {
      return
    }
    source.innerHTML = html
    // 通过高度监听等待dom渲染完成
    await this.waitForComplete(source)
    // 如何判断完成
    const {move, left, top, bottom} = this.splitContainer(source)
    // 内容占高
    const height = (bottom || 0) - (top || 0)
    // 带上容器padding和border的高度，用于和真实撑开的高度对比
    const totalHeight = this.getContainerTotalHeight(target, height)
    source.innerHTML = left ? left.innerHTML : ''
    target.innerHTML = move ? move.innerHTML : ''
    /**
     * 对比结果
     * 误差来源
     * 1. appendHeight(行高相比select range的溢出）按上下平分计算了，但是实际不是均分的
     * 富文本内容没想到真实测量方式
     * 容器内只有一段纯文本占满时，可以用容器和文本的top、bottom差值计算上下溢出
     * 2. scale上的计算误差：offsetHeight基本是整数，rect height会有小数
     */
    console.log('result', Math.round(totalHeight), totalHeight, 'real', target.offsetHeight, target.getBoundingClientRect().height)
  }

  /**
   * 等待元素完成高度变化
   * @param node 当前节点
   * @param interval 定时间隔
   * @param gap 阈值
   */
  waitForComplete (node, interval = 50, gap = 0.1) {
    return new Promise((resolve) => {
      let height = this.getNodeHeight(node)
      const timeFunc = () => {
        let newHeight = this.getNodeHeight(node)
        if (Math.abs(newHeight - height) < gap) {
          this.timer && clearTimeout(this.timer)
          resolve()
        } else {
          height = newHeight
          this.timer = setTimeout(timeFunc, interval)
        }
      }
      this.timer = setTimeout(timeFunc, interval)
    })
  }

  /**
   * 分割当前容器
   * @param node 当前节点
   */
  splitContainer (container) {
    const height = this.getContainerHeight(container)
    return this.splitNode(container, container, height)
  }

  /**
   * 获取容器内容部分高度，包含顶部间距
   * @param node 当前节点
   */
  getContainerHeight (node) {
    // dom可用高度
    const height = this.getHeight(node)
    // 去除padding和border的高度
    const {paddingBottom, borderBottomWidth} = getComputedStyle(node)
    const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth)
    return height - gapHeight * this.getScale(node)
  }

  // 获取容器完整高度
  getContainerTotalHeight (node, height) {
    const {paddingBottom, borderBottomWidth, paddingTop, borderTopWidth} = getComputedStyle(node)
    const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth) + this.getNum(paddingTop) + this.getNum(borderTopWidth)
    return gapHeight + height
  }

  /**
   * 递归分割节点
   * @param node 当前节点
   * @param container 容器
   * @param height 可用高度
   */
  splitNode (node, container, height) {
    if (this.isTextNode(node)) {
      // 1. 纯文本节点，走文本分割逻辑
      return this.splitTextNode(node, container, height)
    }
    // 计算底部位置
    const topOffset = this.getTopOffset(container, node)
    const scale = this.getScale(node)
    const nodeHeight = this.getNodeHeight(node) + topOffset
    if (nodeHeight <= height + this.HEIGHT_GAP) {
      // 2. 没有溢出
      return {left: node.cloneNode(true), move: null, top: null, bottom: null}
    }
    // childNodes包含text node,children不包含
    const children = Array.from(node.childNodes)
    if (topOffset > height + this.HEIGHT_GAP || children.length <= 0 || this.isUnsplitable(node)) {
      const noScaleTop = topOffset / scale
      // 3. 整体都溢出、没有子元素或者不可分割，整个移动
      return {left: null, move: node.cloneNode(true), top: noScaleTop, bottom: this.getNodeHeight(node) / scale + noScaleTop}
    }
    // 4. 遍历处理每个子节点，分离溢出的部分
    const result = {left: null, move: null, top: null, bottom: null}
    const push = (child, wrapkey) => {
      if (child) {
        if (!result[wrapkey]) {
          result[wrapkey] = node.cloneNode()
        }
        if (result[wrapkey]) {
          result[wrapkey].appendChild(child)
        }
      }
    }
    let preleft = true; // 前一个元素的结果
    let followElement = null; // 需要跟随后一个的元素
    for (let idx = 0; idx < children.length; idx++) {
      if (this.isFollowPrevious(children[idx])) {
        // 跟随前一个元素
        push(children[idx].cloneNode(true), preleft ? "left" : "move");
        continue;
      }
      if (this.isFollowNext(children[idx])) {
        // 跟随后一个元素
        if (idx === children.length - 1) {
          // 是最后一个元素
          push(children[idx].cloneNode(true), result.move === null ? "left" : "move");
        } else {
          followElement = children[idx].cloneNode(true);
        }
        continue;
      }
      const {move, left, top, bottom} = this.splitNode(children[idx], container, height)
      push(followElement, move ? "move" : "left");
      push(left, 'left')
      push(move, 'move')
      if (move) {
        preleft = false;
        if (top) {
          result.top = Math.min(top, result.top || top)
        }
        if (bottom) {
          result.bottom = Math.max(bottom, result.bottom || bottom)
        }
      }
      followElement = null;
    }
    return result
  }
  // endregion
  // region 文本节点分割
  /**
   * 获取节点的底部溢出高度
   * @param node 当前节点
   * @param range 当前range
   */
  getAppendHeight (node, range) {
    const parent = node.parentNode
    const {display, lineHeight} = getComputedStyle(parent)
    if (display !== 'inline' && range) {
      const numLineHeight = this.getNum(lineHeight) * this.getScale(parent)
      range.setEnd(range.startContainer, 1)
      // 认为上下均分，除以2
      return Math.max(0, (numLineHeight - this.getHeight(range)) / 2)
    }
    return 0
  }

  /**
   * 获取当前range范围的上下位置
   * @param range 当前range
   * @param appendHeight 附加高度
   */
  getRangeRect (range, appendHeight, container, node) {
    // 获取顶部偏移
    const topOffset = this.getTopOffset(container, range)
    const scale = this.getScale(node.parentNode)
    const top = (topOffset - appendHeight) / scale
    console.log('range rect', topOffset, appendHeight, scale)
    const bottom = (topOffset + this.getHeight(range) + appendHeight) / scale
    return {top, bottom}
  }

  /**
   * 分割文本节点：顶部位置：range top - container top
   * @param node 当前节点
   * @param height 总高度
   * @param top 距离顶部距离
   */
  splitTextNode (node, container, height) {
    // 文本内容
    const text = node.textContent || ''
    // 创建range
    const range = this.createRange(node)
    // 文本长度
    const length = range.endOffset
    // 获取附加高度
    const appendHeight = this.getAppendHeight(node, range)
    // 获取顶部偏移
    const top = this.getTopOffset(container, range)
    // 计算选中范围的高度是否溢出
    const isOver = () => {
      return this.getHeight(range) + top + appendHeight > height + this.HEIGHT_GAP
    }
    // 整体没有溢出
    range.setEnd(range.startContainer, length)
    if (!isOver()) {
      return {move: null, left: this.createTextNode(text), top: null, bottom: null}
    }
    // 整体溢出
    range.setEnd(range.startContainer, 0)
    if (isOver()) {
      range.setEnd(range.startContainer, length)
      return {move: this.createTextNode(text), left: null, ...this.getRangeRect(range, appendHeight, container, node)}
    }
    // 二分查找临界位置
    const end = this.halfSplit(range, 1, length, isOver)
    // 分离文本创建新节点
    const leftText = text.slice(0, end)
    const moveText = text.slice(end)
    // 设置范围
    range.setStart(range.startContainer, end)
    range.setEnd(range.startContainer, length)

    return Object.assign(
      {
        left: this.createTextNode(leftText),
        move: this.createTextNode(moveText)
      },
      this.getRangeRect(range, appendHeight, container, node)
    )
  }

  /** 创建文本节点
   * @param text 文本内容
   */
  createTextNode (text) {
    if (text.length) {
      const node = document.createTextNode(text)
      return node
    }
    return null
  }

  /** 二分查找临界位置
   * range的offset是从1开始算1个字符的，所以序号也从1开始标记
   * 最后返回的offset是溢出点，本身需要move
   * @param range 当前range
   * @param start 起始序号[1开始]
   * @param end 结束序号
   * @param isOver 溢出判断
   */
  halfSplit (range, start, end, isOver) {
    const half = Math.floor((end - start) / 2) + start
    range.setEnd(range.startContainer, half)
    if (isOver()) {
      // 缩短
      return half - start <= 1 ? start : this.halfSplit(range, start, half, isOver)
    } else {
      // 变长
      return end - half <= 1 ? half : this.halfSplit(range, half, end, isOver)
    }
  }
  // endregion
}
