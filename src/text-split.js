/**
 * 文本拆分
 * 1. 流程：
 * 递归遍历dom树
 *   - 若为纯文本节点，二分分割
 *   - 若为元素节点，递归处理子节点
 * 2.tips
 *  - getBoundingClientRect是受transform缩放影响的，offsetHeight不是
 *  - selectRange只有getBoundingClientRect
 *  - follow previous和next的元素只做位置迁移，不计算高度，认为不占位
 * 3. 高度计算误差说明
 *  - appendHeight(行高相比select range的溢出）按上下平分计算了，但是实际不是均分的
 *  - scale上的计算误差：offsetHeight基本是整数，rect height会有小数
 */
export default class TextSplit {
  // 常量
  // 允许误差
  HEIGHT_GAP = 0.001
  // 垂直重合判断允许误差范围
  LINE_OFFSET = 1
  // 不可分割标签（大写）
  UNSPLIT_TAGS = []
  // 不可分割的类名
  UNSPLIT_CLASSES = ['MathJax', 'MathJax_Display']
  // 不可切割元素，实际的高度测量元素
  // 是对公式的特殊处理，行内外层span小于实际高度
  HEIGHT_CLASSES = ['math']
  // 跟随前一个元素的标签（大写）
  FOLLOW_PREVIOUS_TAGS = ['SCRIPT']
  // 跟随前一个元素的类名
  FOLLOW_PREVIOUS_CLASSES = []
  // 跟随后一个元素的标签（大写）
  FOLLOW_NEXT_TAGS = []
  // 跟随后一个元素的类名
  FOLLOW_NEXT_CLASSES = ['MathJax_Preview']

  // region 辅助函数
  /** 获取定位高度计算的元素 */
  getCalcValue (target, getValue, compare) {
    const targetValue = getValue(target)
    if (this.isUnsplitable(target)) {
      const heightEle = target && target.querySelector ? target.querySelector(this.HEIGHT_CLASSES.map(cls => `.${cls}`).join(',')) : null
      if (heightEle) {
        return Math[compare](getValue(heightEle), targetValue)
      }
    }
    return targetValue
  }

  /** 获取缩放比 */
  getScale (node) {
    const offsetHeight = this.getCalcValue(node, target => target ? target.offsetHeight : 0, 'max')
    return offsetHeight ? this.getHeight(node) / offsetHeight : 0
  }

  /** style 属性转为数字 */
  getNum (numval) {
    const num = parseFloat(numval)
    return isNaN(num) ? 0 : num
  }

  /** 创建range用于text节点高度计算 */
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
  getTopOffset (container, target) {
    const containerTop = container.getBoundingClientRect().top
    const nodeTop = this.getCalcValue(target, t => t.getBoundingClientRect().top, 'min')
    return nodeTop - containerTop
  }

  /** 获取bound高度， */
  getHeight (target) {
    const rectHeight = this.getCalcValue(target, t => t.getBoundingClientRect().height, 'max')
    return rectHeight
  }

  isMatchTagOrClass (tags, classNames, target) {
    if (this.isTextNode(target) || target instanceof Range) {
      return false
    }
    if (tags.includes(target.tagName.toUpperCase())) {
      return true
    }
    const classList = target.classList
    return classNames.findIndex(cls => classList.contains(cls)) >= 0
  }

  /** 判断是否可分割 */
  isUnsplitable (target) {
    return this.isMatchTagOrClass(this.UNSPLIT_TAGS, this.UNSPLIT_CLASSES, target)
  }

  isFollowPrevious (target) {
    return this.isMatchTagOrClass(this.FOLLOW_PREVIOUS_TAGS, this.FOLLOW_PREVIOUS_CLASSES, target)
  }

  isFollowNext (target) {
    return this.isMatchTagOrClass(this.FOLLOW_NEXT_TAGS, this.FOLLOW_NEXT_CLASSES, target)
  }

  /** 获取dom节点高度 */
  getNodeHeight (target) {
    return Math.max(this.getHeight(target), target.scrollHeight * this.getScale(target))
  }

  /** 获取顶部距离 */
  getTopDistance (target) {
    const {paddingTop, borderTopWidth} = getComputedStyle(target)
    return this.getNum(paddingTop) + this.getNum(borderTopWidth)
  }

  // endregion

  // region 功能函数
  timer = null

  /**
   * 节点内容分割入口
   * 分割前一个dom内容后，为dom和下一个dom重新赋值html
   * @param targets dom列表
   * @param html html文本或有html内容的dom
   * @param handler 设置html后，wait height前的处理，可不传
   */
  async splitText (html, divList, handler) {
    if (this.timer) {
      clearTimeout(this.timer)
    }
    if (divList.length <= 0) {
      return
    }
    const source = divList[0]
    const isString = typeof html === 'string'
    if (isString) {
      source.innerHTML = html
      // 通过高度监听等待dom渲染完成
      await this.waitRender(source, handler)
    }
    // 开始切割
    const results = this.splitContainer(divList, isString ? source : html)
    console.log('split results', results)
    divList.forEach((div, index) => {
      const result = results[index] || {}
      div.innerHTML = result.element ? result.element.innerHTML : ''
      // // 测试内容占高
      // const height = (result.bottom || 0) - (result.top || 0)
      // // 带上容器padding和border的高度，用于和真实撑开的高度对比
      // const totalHeight = this.getContainerTotalHeight(div, height)
      // console.log('result', totalHeight, 'real', div.getBoundingClientRect().height, 'content', height)
    })
  }

  /**
   * 获取容器内容高度：不含padding、border，带小数
   * @param {Element} container 容器
   * @param {number} height  容器内容高度
   */
  getContentHeight (container, height) {
    // 获取顶部额外距离
    const gapHeight = this.getTopDistance(container)
    // 模拟一个div list,第一个的高度为height+顶部距离
    const heights = [
      {
        height: height + gapHeight,
        top: 0,
        bottom: null,
        element: null
      },
      {
        height,
        top: height,
        bottom: null,
        element: null
      }
    ]
    this.splitNode(container, container, heights, 0)
    return heights[0].bottom - heights[0].top - gapHeight
  }

  /** 等待渲染完成 */
  async waitRender (container, handler) {
    if (handler) {
      await handler()
    }
    await this.waitForComplete(container)
  }

  /** 判断渲染是否完成
   * - 检查公式节点结构
   */
  isRenderComplete (node) {
    return !node.querySelector('.MathJax_Processing,.MathJax_Processed,.MathJax_Preview+script')
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
        const newHeight = this.getNodeHeight(node)
        if (Math.abs(newHeight - height) < gap && this.isRenderComplete(node)) {
          if (this.timer) {
            clearTimeout(this.timer)
          }
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
   * @param html html dom
   * @returns {Array}
   */
  splitContainer (divList, container) {
    let startTop = 0
    const heights = divList.map((div, index) => {
      const height = this.getContainerHeight(div, index === 0)
      const top = startTop
      startTop += height
      return {
        height,
        top,
        bottom: null,
        element: null
      }
    })
    const nodeMap = this.splitNode(container, container, heights, 0)
    heights.forEach((current, idx) => {
      if (nodeMap[idx]) {
        current.element = nodeMap[idx].node || null
      }
      // 对于第一个元素，去除额外的顶部间距，和其他div保持结果中高度逻辑上的统一
      if (idx === 0) {
        const topDistance = this.getTopDistance(divList[idx])
        heights[idx].height -= topDistance
        heights[idx].top += topDistance
      }
    })
    return heights
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
      return heightWithBottom - this.getNum(paddingTop) - this.getNum(borderTopWidth)
    } else {
      return heightWithBottom
    }
  }

  /**
   * 获取容器完整高度
   * @param {*} node 节点
   * @param {number} height 当前高度
   * @returns {number}
   */
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
   * @param {number} startIdx 起始索引
   */
  findStart (top, bottom, unsplitable, heights, startIdx) {
    let start = startIdx
    let isOver = false
    for (let i = startIdx; i < heights.length; i++) {
      const total = heights[i].height + heights[i].top
      start = i
      if (top > total + this.HEIGHT_GAP) {
        // 顶部超过当前容器的范围
        continue
      }
      // 顶部没有超过，记录为起始容器，并判断底部是否溢出
      isOver = i < heights.length - 1 && bottom > total + this.HEIGHT_GAP
      if (isOver && unsplitable) {
        // 不可分割容器，直接下移，假设它不会超过一个容器大小
        start = Math.min(i + 1, heights.length - 1)
        isOver = false
      }
      break
    }
    return {start, isOver}
  }

  /** 查找数值最大的key */
  findNumberKey (obj) {
    // 转换为数字数组
    const keys = Object.keys(obj).map(Number)
    return {
      max: Math.max(...keys),
      min: Math.min(...keys)
    }
  }

  /**
   * 递归分割节点
   * @param node 当前节点
   * @param container 容器
   * @param heights 结果列表
   * @param startIdx 起始容器索引
   */
  splitNode (node, container, heights, startIdx = 0) {
    if (this.isTextNode(node)) {
      // 1. 纯文本节点，走文本分割逻辑
      return this.splitTextNode(node, container, heights, startIdx)
    }
    // 顶部位置
    const topOffset = this.getTopOffset(container, node)
    const scale = this.getScale(node)
    // 底部位置
    const nodeHeight = this.getNodeHeight(node) + topOffset
    // 子元素列表
    const children = Array.from(node.childNodes)
    // 是否可分割
    const unsplitable = children.length <= 0 || this.isUnsplitable(node)
    const {start, isOver} = this.findStart(topOffset, nodeHeight, unsplitable, heights, startIdx)
    const block = getComputedStyle(node).display !== 'inline'
    // 结果存储
    const resultMap = {}
    if (!isOver && (scale || unsplitable)) {
      // 不需要分割，返回top和bottom,判断仍有欠缺再考虑left和right
      const noScaleTop = scale ? topOffset / scale : heights[start].top
      const noScaleBottom = scale ? this.getNodeHeight(node) / scale + noScaleTop : heights[start].bottom
      resultMap[start] = {
        node: node.cloneNode(true),
        top: noScaleTop,
        bottom: noScaleBottom,
        block
      }
      heights[start].top = Math.min(noScaleTop, heights[start].top)
      heights[start].bottom = Math.max(noScaleBottom, heights[start].bottom)
      return resultMap
    }
    // 4. 遍历处理每个子节点，分离溢出的部分
    const tempResult = {}
    const push = (currentIndex, currentChild) => {
      if (currentChild.node) {
        tempResult[currentIndex] = tempResult[currentIndex] || []
        tempResult[currentIndex].push(currentChild)
      }
    }
    // 前一个元素的结果
    let preleft = 0
    let prepos = {top: 0, bottom: 0}
    // 需要跟随后一个的元素
    let followElement = null
    for (let idx = 0; idx < children.length; idx++) {
      if (this.isFollowPrevious(children[idx])) {
        push(preleft, {node: followElement, ...prepos})
        followElement = null
        // 跟随前一个元素
        push(preleft, {node: children[idx].cloneNode(true), ...prepos})
        continue
      }
      if (this.isFollowNext(children[idx])) {
        // 跟随后一个元素
        if (idx === children.length - 1) {
          // 是最后一个元素
          push(idx, {node: children[idx].cloneNode(true), ...prepos})
        } else {
          followElement = children[idx].cloneNode(true)
        }
        continue
      }
      const currentResult = this.splitNode(children[idx], container, heights, preleft)
      const keys = this.findNumberKey(currentResult)
      preleft = keys.max
      prepos = {top: currentResult[preleft].top, bottom: currentResult[preleft].bottom}
      // 同行处理
      this.moveNodes(keys.min, currentResult[keys.min], tempResult)
      // 先推入followElement,再放结果
      push(preleft, {node: followElement, ...prepos})
      for (const startIndex in currentResult) {
        push(startIndex, currentResult[startIndex])
      }
      followElement = null
    }
    // 创建返回节点
    for (const index in tempResult) {
      const current = tempResult[index]
      if (!current.length) {
        continue
      }
      resultMap[index] = {node: node.cloneNode(), top: current[0].top, bottom: current[0].bottom, block}
      current.forEach(child => {
        const savePos = resultMap[index]
        savePos.node.appendChild(child.node)
        savePos.top = Math.min(savePos.top, child.top)
        savePos.bottom = Math.max(savePos.bottom, child.bottom)
      })
    }
    return resultMap
  }

  /** 基于top、bottom的是否同行判断 */
  moveNodes (index, result, tempResult) {
    const lastArray = tempResult[index - 1]
    const {top, bottom} = result
    if (lastArray && lastArray.length) {
      const moved = []
      const lefted = []
      lastArray.forEach(current => {
        const sameLine = !current.block && current.bottom - top > this.LINE_OFFSET && current.top - bottom < this.LINE_OFFSET
        if (sameLine) {
          moved.push(current)
        } else {
          lefted.push(current)
        }
      })
      if (moved.length) {
        tempResult[index - 1] = lefted
        tempResult[index] = (tempResult[index] || []).concat(moved)
      }
    }
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
    target.top = Math.min(top, target.top)
    target.bottom = Math.max(bottom, target.bottom)
    return {top, bottom, block: false}
  }

  /**
   * 分割文本节点：顶部位置：range top - container top
   * @param node 当前节点
   * @param container 容器
   * @param heights 距离集合
   * @param startIdx 起始容器索引
   */
  splitTextNode (node, container, heights, startIdx = 0) {
    // 文本内容
    const text = node.textContent || ''
    // 创建range
    const range = this.createRange(node)
    // 文本长度
    const length = range.endOffset
    const rangeHeight = this.getHeight(range)
    if (!rangeHeight) {
      // 处理不占位的空range, 返回的rect全都是0
      return {
        [startIdx]: {
          node: this.createTextNode(text),
          block: false,
          top: heights[startIdx].bottom,
          bottom: heights[startIdx].bottom
        }}
    }
    // 获取附加高度
    const appendHeight = this.getAppendHeight(node, range)
    // 获取顶部偏移
    const top = this.getTopOffset(container, range)
    const resultMap = {}
    // 整体没有溢出
    range.setEnd(range.startContainer, length)
    const totalRange = this.findStart(top, rangeHeight + top + appendHeight, false, heights, startIdx)
    if (!totalRange.isOver) {
      const pos = this.getRangeRect(range, appendHeight, container, node, heights[totalRange.start])
      resultMap[totalRange.start] = {
        node: this.createTextNode(text),
        ...pos
      }
      return resultMap
    }
    let posStart = 0
    for (let start = totalRange.start; start < heights.length; start++) {
      // 二分查找临界位置
      const startChange = () => this.findStart(top, this.getHeight(range) + top + appendHeight, true, heights, startIdx).start > start
      range.setStart(range.startContainer, posStart)
      // 首尾都指向空位置，以处理整体下移或者不移动的情况,end为最后一个在当前容器的位置(1开始计数)
      const end = this.halfSplit(range, posStart, length + 1, startChange)
      // 分离文本
      const newText = text.slice(posStart, end)
      if (newText.length) {
        range.setEnd(range.startContainer, end)
        const pos = this.getRangeRect(range, appendHeight, container, node, heights[start])
        resultMap[start] = {
          node: this.createTextNode(newText),
          ...pos
        }
      }
      posStart = end
      if (end >= length) {
        break
      }
    }
    return resultMap
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
