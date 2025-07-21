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
 *  4. 返回结构以{top,bottom,element}[]形式返回
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
  async splitText (html, divList) {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    if (divList.length <= 0) {
      return
    }
    const source = divList[0];
    source.innerHTML = html
    // 通过高度监听等待dom渲染完成
    await this.waitForComplete(source)
    // 开始切割，返回结构定义[{top, bottom, element}]
    const results = this.splitContainer(divList);
    console.log(results);
    divList.forEach((div, index) => {
      const result = results[index] || {};
      div.innerHTML = result.element ? result.element.innerHTML : '';
      // 测试内容占高
      const height = (result.bottom || 0) - (result.top || 0);
      // 带上容器padding和border的高度，用于和真实撑开的高度对比
      const totalHeight = this.getContainerTotalHeight(div, height);
      /**
     * 对比结果
     * 误差来源
     * 1. appendHeight(行高相比select range的溢出）按上下平分计算了，但是实际不是均分的
     * 富文本内容没想到真实测量方式
     * 容器内只有一段纯文本占满时，可以用容器和文本的top、bottom差值计算上下溢出
     * 2. scale上的计算误差：offsetHeight基本是整数，rect height会有小数
     */
      console.log('result', Math.round(totalHeight), totalHeight, 'real', div.offsetHeight, div.getBoundingClientRect().height);
    })
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
   * @param {Array} divList 节点列表，第一个节点是有真实dom的
   * @returns {Array}
   */
  splitContainer (divList) {
    // 第一个元素是有dom在的
    const container = divList[0];
    let startTop = 0;
    const heights = divList.map((div, index) => {
      const height = this.getContainerHeight(div, index == 0);
      const top = startTop;
      startTop += height;
      return {
        height,
        top,
        bottom: null,
        element: null
      }
    });
    const nodeMap = this.splitNode(container, container, heights);
    heights.forEach((current, idx) => {
      current.element = nodeMap[idx] || null;
    })
    return heights;
  }

  /**
   * 获取容器内容部分高度，包含顶部间距
   * @param node 当前节点
   * @param {boolean} includeTop 是否包含顶部间距
   */
  getContainerHeight (node, includeTop) {
    // dom可用高度
    const height = this.getHeight(node)
    // 去除padding和border的高度
    const {paddingBottom, borderBottomWidth, paddingTop, borderTopWidth} = getComputedStyle(node)
    const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth)
    const heightWithBottom = height - gapHeight * this.getScale(node)
    if (!includeTop) {
      return heightWithBottom - this.getNum(paddingTop) - this.getNum(borderTopWidth);
    } else {
      return heightWithBottom;
    }
  }

  // 获取容器完整高度
  getContainerTotalHeight (node, height) {
    const {paddingBottom, borderBottomWidth, paddingTop, borderTopWidth} = getComputedStyle(node)
    const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth) + this.getNum(paddingTop) + this.getNum(borderTopWidth)
    return gapHeight + height
  }
  /**
   * 计算元素新的起始位置，并返回是否溢出
   * @param {number} top
   * @param {number} bottom
   * @param {boolean} unsplitable 是否可分割
   * @param {Array} heights
   */
  findStart (top, bottom, unsplitable, heights) {
    let start = 0;
    let isOver = false;
    for (let i = 0; i < heights.length; i++) {
      const total = heights[i].height + heights[i].top;
      if (top > total + this.HEIGHT_GAP) {
        // 顶部超过当前容器的范围
        continue;
      }
      // 顶部没有超过，记录为起始容器，并判断底部是否溢出
      start = i;
      isOver = i < heights.length-1 && bottom > total + this.HEIGHT_GAP;
      if (isOver && unsplitable) {
        // 不可分割容器，直接下移，假设它不会超过一个容器大小
        start = Math.min(i + 1, heights.length - 1);
        isOver = false;
      }
      break;
    }
    return {start, isOver};
  }
  /** 查找数值最大的key */
  findMaxNumberKey (obj) {
    const keys = Object.keys(obj).map(Number);  // 转换为数字数组
    return Math.max(...keys);
  }

  /**
   * 递归分割节点
   * @param node 当前节点
   * @param container 容器
   * @param heights 结果列表
   */
  splitNode (node, container, heights) {
    if (this.isTextNode(node)) {
      // 1. 纯文本节点，走文本分割逻辑
      return this.splitTextNode(node, container, heights)
    }
    // 顶部位置
    const topOffset = this.getTopOffset(container, node)
    const scale = this.getScale(node)
    // 底部位置
    const nodeHeight = this.getNodeHeight(node) + topOffset
    // 子元素列表
    const children = Array.from(node.childNodes)
    // 是否可分割
    const unsplitable = children.length <= 0 || this.isUnsplitable(node);
    const {start, isOver} = this.findStart(topOffset, nodeHeight, unsplitable, heights);
    // 结果存储
    const resultMap = {};
    if (!isOver) {
      // 不需要分割
      resultMap[start] = node.cloneNode(true);
      const noScaleTop = topOffset / scale;
      heights[start].top = Math.min(noScaleTop, heights[start].top);
      heights[start].bottom = Math.max(this.getNodeHeight(node) / scale + noScaleTop, heights[start].bottom);
      return resultMap;
    }
    // 4. 遍历处理每个子节点，分离溢出的部分
    const push = (childs) => {
      for (let start in childs) {
        if (childs[start]) {
          if (!resultMap[start]) {
            resultMap[start] = node.cloneNode();
          }
          if (resultMap[start]) {
            resultMap[start].appendChild(childs[start]);
          }
        }
      }
    }
    let preleft = 0; // 前一个元素的结果
    let followElement = null; // 需要跟随后一个的元素
    for (let idx = 0; idx < children.length; idx++) {
      if (this.isFollowPrevious(children[idx])) {
        // 跟随前一个元素
        push({[preleft]: children[idx].cloneNode(true)});
        continue;
      }
      if (this.isFollowNext(children[idx])) {
        // 跟随后一个元素
        if (idx === children.length - 1) {
          // 是最后一个元素
          push({[idx]: children[idx].cloneNode(true)});
        } else {
          followElement = children[idx].cloneNode(true);
        }
        continue;
      }
      const resultMap = this.splitNode(children[idx], container, heights);
      preleft = this.findMaxNumberKey(resultMap);
      // 先推入followElement,再放结果
      push({[preleft]: followElement});
      push(resultMap);
      followElement = null;
    }
    return resultMap
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
  getRangeRect (range, appendHeight, container, node, target) {
    // 获取顶部偏移
    const topOffset = this.getTopOffset(container, range)
    const scale = this.getScale(node.parentNode)
    const top = (topOffset - appendHeight) / scale
    const bottom = (topOffset + this.getHeight(range) + appendHeight) / scale
    target.top = Math.min(top, target.top);
    target.bottom = Math.max(bottom, target.bottom);
  }

  /**
   * 分割文本节点：顶部位置：range top - container top
   * @param node 当前节点
   * @param container 容器
   * @param heights 距离集合
   */
  splitTextNode (node, container, heights) {
    // 文本内容
    const text = node.textContent || ''
    // 创建range
    const range = this.createRange(node)
    // 文本长度
    const length = range.endOffset
    // 获取附加高度
    const appendHeight = this.getAppendHeight(node, range)
    // 获取顶部偏移
    const top = this.getTopOffset(container, range);
    const resultMap = {};
    // 整体没有溢出
    range.setEnd(range.startContainer, length)
    const totalRange = this.findStart(top, this.getHeight(range) + top + appendHeight, false, heights);
    if (!totalRange.isOver) {
      resultMap[totalRange.start] = this.createTextNode(text);
      this.getRangeRect(range, appendHeight, container, node, heights[totalRange.start]);
      return resultMap;
    }
    let posStart = 0;
    for (let start = totalRange.start; start < heights.length; start++) {
      // 二分查找临界位置
      const startChange = () => this.findStart(top, this.getHeight(range) + top + appendHeight, true, heights).start > start;
      // 首尾都指向空位置，以处理整体下移或者不移动的情况,end为最后一个在当前容器的位置(1开始计数)
      const end = this.halfSplit(range, posStart, length + 1, startChange);
      // 分离文本
      const newText = text.slice(posStart, end);
      if (newText.length) {
        resultMap[start] = this.createTextNode(newText);
        range.setEnd(range.startContainer, end);
        this.getRangeRect(range, appendHeight, container, node, heights[start]);
      }
      posStart = end;
      if (end >= length) {
        break;
      }
    }
    return resultMap;
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
