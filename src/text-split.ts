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
 */
interface ISplitResult {
    // 留在source的节点
    left: Node | null;
    // 移动的节点
    move: Node | null;
    // 移动节点的顶部位置
    top: number | null;
    // 移动节点的底部位置
    bottom: number | null;
}
export default class TextSplit {
    /**************************常量 *****************************/
    // 允许误差
    HEIGHT_GAP = 0.001;
    // 不可分割标签
    UNSPLIT_TAGS: string[] = [];
    // 不可分割的类名
    UNSPLIT_CLASSES: string[] = [];
    /**************************辅助函数 ******************************/
    /** 获取缩放比
     * @param node 当前节点
     */
    private getScale(node: Element) {
        const offsetHeight = (node as HTMLElement).offsetHeight;
        return offsetHeight ? this.getHeight(node) / offsetHeight : 0;
    }
    /** 字符串转数值
     * @param numval 数字字符串
     */
    private getNum(numval: string) {
        const num = parseFloat(numval);
        return isNaN(num) ? 0 : num;
    }
    /** 创建range
     * @param node 当前节点
     */
    private createRange(node: Element) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range;
    }
    /**
     * 判断是否纯文本节点-不带div的那种
     * @param node 目标节点
     */
    private isTextNode(node: Element) {
        // Node.TEXT_NODE = 3
        return node.nodeType === Node.TEXT_NODE;
    }
    /** 计算到容器顶部的距离 */
    private getTopOffset(container: Element, node: Element | Range) {
        return node.getBoundingClientRect().top - container.getBoundingClientRect().top;
    }
    /** 获取bound高度 */
    private getHeight(target: Range | Element) {
        return target.getBoundingClientRect().height;
    }
    /** 判断是否可分割 */
    private isUnsplitable(target: Element) {
        if (this.UNSPLIT_TAGS.includes(target.tagName.toUpperCase())) {
            return true;
        }
        const classList = target.classList;
        return this.UNSPLIT_TAGS.findIndex(cls => classList.contains(cls)) >= 0;
    }

    /********************功能函数**********************/
    timer: number | null = null;
    /**
     * 节点内容分割入口
     * 分割前一个dom内容后，为dom和下一个dom重新赋值html
     * @param targets dom列表
     * @param html html文本
     */
    async splitText(source: HTMLDivElement, target: HTMLDivElement, html: string) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (!source) {
            return;
        }
        source.innerHTML = html;
        // 通过高度监听等待dom渲染完成
        await this.waitForComplete(source);
        // 如何判断完成
        const { move, left, top, bottom } = this.splitContainer(source);
        const height = (bottom || 0) - (top || 0);
        console.log(top, bottom, height);
        const totalHeight = this.getContainerTotalHeight(target, height);
        source.innerHTML = (left as Element)?.innerHTML || "";
        target.innerHTML = (move as Element)?.innerHTML || "";
        console.log("result", Math.round(totalHeight), totalHeight, "real", target.offsetHeight, target.getBoundingClientRect().height);
    }
    /**
     * 等待元素完成高度变化
     * @param node 当前节点
     * @param interval 定时间隔
     * @param gap 阈值
     */
    private waitForComplete(node: Element, interval: number = 50, gap = 0.1) {
        return new Promise<void>((resolve) => {
            let height = node.scrollHeight;
            const timeFunc = () => {
                let newHeight = node.scrollHeight;
                if (Math.abs(newHeight - height) < gap) {
                    this.timer && clearTimeout(this.timer);
                    resolve();
                } else {
                    height = newHeight;
                    this.timer = setTimeout(timeFunc, interval);
                }
            }
            this.timer = setTimeout(timeFunc, interval);
        });
    }
    /**
     * 分割当前容器
     * @param node 当前节点
     */
    splitContainer(container: Element): ISplitResult {
        const height = this.getContainerHeight(container);
        return this.splitNode(container, container, height);
    }

    /**
     * 获取容器内容部分高度，包含顶部间距
     * @param node 当前节点
     */
    private getContainerHeight(node: Element) {
        // dom可用高度
        const height = this.getHeight(node);
        // 去除padding和border的高度
        const { paddingBottom, borderBottomWidth } = getComputedStyle(node);
        const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth);
        return height - gapHeight * this.getScale(node);
    }
    // 获取容器完整高度
    private getContainerTotalHeight(node: Element, height: number) {
        const { paddingBottom, borderBottomWidth, paddingTop, borderTopWidth } = getComputedStyle(node);
        const gapHeight = this.getNum(paddingBottom) + this.getNum(borderBottomWidth) + this.getNum(paddingTop) + this.getNum(borderTopWidth);
        return gapHeight + height;
    }

    /**
     * 递归分割节点
     * @param node 当前节点
     * @param container 容器
     * @param height 可用高度
     */
    private splitNode(node: Element, container: Element, height: number): ISplitResult {
        if (this.isTextNode(node)) {
            // 1. 纯文本节点，走文本分割逻辑
            return this.splitTextNode(node, container, height);
        }
        // 计算底部位置
        const topOffset = this.getTopOffset(container, node);
        const scale = this.getScale(node);
        const nodeHeight = node.scrollHeight * scale + topOffset;
        if (nodeHeight <= height + this.HEIGHT_GAP) {
            // 2. 没有溢出
            return { left: node.cloneNode(true), move: null, top: null, bottom: null };
        }
        // childNodes包含text node,children不包含
        const children = Array.from(node.childNodes);
        if (topOffset > height + this.HEIGHT_GAP || children.length <= 0 || this.isUnsplitable(node)) {
            const noScaleTop = topOffset / scale;
            // 3. 整体都溢出、没有子元素或者不可分割，整个移动
            return { left: null, move: node.cloneNode(true), top: noScaleTop, bottom: node.scrollHeight + noScaleTop };
        }
        // 4. 遍历处理每个子节点，分离溢出的部分
        const result: ISplitResult = { left: null, move: null, top: null, bottom: null };
        const push = (child: Node | null, wrapkey: "left" | "move") => {
            if (child) {
                if (!result[wrapkey]) {
                    result[wrapkey] = node.cloneNode();
                }
                result[wrapkey]?.appendChild(child);
            }
        }
        for (let idx = 0; idx < children.length; idx++) {
            const { move, left, top, bottom } = this.splitNode(children[idx] as Element, container, height);
            push(left, "left");
            push(move, "move");
            if (move) {
                if (top) {
                    result.top = Math.min(top, result.top || top);
                }
                if (bottom) {
                    result.bottom = Math.max(bottom, result.bottom || bottom);
                }
            }
        }
        return result;
    }

    /********************文本节点分割 *****************************/
    /**
     * 获取节点的底部溢出高度
     * @param node 当前节点
     * @param range 当前range
     */
    getAppendHeight(node: Element, range: Range) {
        const parent = node.parentNode as Element;
        const { display, lineHeight } = getComputedStyle(parent);
        if (display !== "inline" && range) {
            const numLineHeight = this.getNum(lineHeight) * this.getScale(parent);
            range.setEnd(range.startContainer, 1);
            // 认为上下均分，除以2
            return Math.max(0, (numLineHeight - this.getHeight(range)) / 2);
        }
        return 0;
    }
    /**
     * 获取当前range范围的上下位置
     * @param range 当前range
     * @param appendHeight 附加高度
     */
    getRangeRect(range: Range, appendHeight: number, container: Element, node: Element) {
        // 获取顶部偏移
        const topOffset = this.getTopOffset(container, range);
        const scale = this.getScale(node.parentNode as Element);
        const top = (topOffset - appendHeight) / scale;
        const bottom = (topOffset + this.getHeight(range) + appendHeight) / scale;
        return { top, bottom };
    }
    /**
     * 分割文本节点：顶部位置：range top - container top
     * @param node 当前节点
     * @param height 总高度
     * @param top 距离顶部距离
     */
    private splitTextNode(node: Element, container: Element, height: number): ISplitResult {
        // 文本内容
        const text = node.textContent || '';
        // 创建range
        const range = this.createRange(node);
        // 文本长度
        const length = range.endOffset;
        // 获取附加高度
        const appendHeight = this.getAppendHeight(node, range);
        // 获取顶部偏移
        const top = this.getTopOffset(container, range);
        // 计算选中范围的高度是否溢出
        const isOver = () => {
            return this.getHeight(range) + top + appendHeight > height + this.HEIGHT_GAP;
        }
        // 整体没有溢出
        range.setEnd(range.startContainer, length);
        if (!isOver()) {
            return { move: null, left: this.createTextNode(text), top: null, bottom: null };
        }
        // 整体溢出
        range.setEnd(range.startContainer, 0);
        if (isOver()) {
            range.setEnd(range.startContainer, length);
            return { move: this.createTextNode(text), left: null, ...this.getRangeRect(range, appendHeight, container, node) };
        }
        // 二分查找临界位置
        const end = this.halfSplit(range, 1, length, isOver);
        // 分离文本创建新节点
        const leftText = text.slice(0, end);
        const moveText = text.slice(end);
        // 设置范围
        range.setStart(range.startContainer, end);
        range.setEnd(range.startContainer, length);

        return { left: this.createTextNode(leftText), move: this.createTextNode(moveText), ...this.getRangeRect(range, appendHeight, container, node) };
    }
    /** 创建文本节点
     * @param text 文本内容
     */
    private createTextNode(text: string): Text | null {
        if (text.length) {
            const node = document.createTextNode(text);
            return node;
        }
        return null;
    }
    /** 二分查找临界位置
     * range的offset是从1开始算1个字符的，所以序号也从1开始标记
     * 最后返回的offset是溢出点，本身需要move
     * @param range 当前range
     * @param start 起始序号[1开始]
     * @param end 结束序号
     * @param isOver 溢出判断
     */
    private halfSplit(range: Range, start: number, end: number, isOver: () => boolean): number {
        const half = Math.floor((end - start) / 2) + start;
        range.setEnd(range.startContainer, half);
        if (isOver()) {
            // 缩短
            return half - start <= 1 ? start : this.halfSplit(range, start, half, isOver);
        } else {
            // 变长
            return end - half <= 1 ? half : this.halfSplit(range, half, end, isOver);
        }
    }
}