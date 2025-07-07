/**
 * 文本拆分
 * 1. 递归遍历dom树
 *   1.1 若为纯文本节点，二分分割
 *   1.2 若为元素节点，递归处理子节点，
 *   每个节点分割后，返回{left, move}结构的新节点，用于构建新节点，没有则为null
 */
interface ISplitResult {
    left: Node | null;
    move: Node | null;
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
    /**
     * 节点内容分割入口
     * @param targets 存放dom
     * @param target 第二个dom
     * @param html html文本
     */
    splitText(targets: HTMLDivElement[], html: string) {
        if (targets.length <= 0) {
            return;
        }
        targets[0].innerHTML = html;
        for (let i = 1; i < targets.length; i++) {
            const source = targets[i - 1];
            const target = targets[i];
            const { move, left } = this.splitContainer(source);
            source.innerHTML = (left as Element)?.getHTML() || "";
            target.innerHTML = (move as Element)?.getHTML() || "";
        }
    }
    /** 对指定容器做分割 */
    splitContainer(node: Element): ISplitResult {
        const height = this.getContainerHeight(node);
        return this.splitNode(node, node, height);
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
        return height - gapHeight;
    }

    /**
     * 嵌套分割节点
     * @param node 当前节点
     * @param height 总高度
     * @param top 距离顶部距离
     */
    private splitNode(node: Element, container: Element, height: number): ISplitResult {
        if (this.isTextNode(node)) {
            // 纯文本节点
            return this.splitTextNode(node, container, height);
        }
        const nodeHeight = node.scrollHeight + this.getTopOffset(container, node);
        if (nodeHeight <= height + this.HEIGHT_GAP) {
            // 没有溢出
            return { left: node.cloneNode(true), move: null };
        }
        const children = Array.from(node.childNodes);
        if (children.length <= 0 || this.isUnsplitable(node)) {
            // 没有子元素，整个溢出
            return { left: null, move: node.cloneNode(true) };
        }
        // 遍历处理每个子节点
        let leftWrap = null;
        let moveWrap = null;
        for (let idx = 0; idx < children.length; idx++) {
            const { move, left } = this.splitNode(children[idx] as Element, container, height);
            if (left) {
                if (!leftWrap) {
                    leftWrap = node.cloneNode();
                }
                leftWrap.appendChild(left);
            }
            if (move) {
                if (!moveWrap) {
                    moveWrap = node.cloneNode();
                }
                moveWrap.appendChild(move);
            }
        }
        return { left: leftWrap, move: moveWrap };
    }
    /** 获取range和lineHeight的差值高度
     * range.getBoundingClientRect().height基本上是无关缩放的，可能有小数位差
     * top - 从自己的top开始
     * height - 需要加上appendHeight
     */
    getAppendHeight(node: Element, range: Range) {
        const { display, lineHeight } = getComputedStyle(node.parentNode as Element);
        if (display !== "inline" && range) {
            const numLineHeight = this.getNum(lineHeight);
            range.setEnd(range.startContainer, 1);
            return Math.max(0, (numLineHeight - this.getHeight(range)) / 2);
        }
        return 0;
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
        const range = this.createRange(node);
        const length = range.endOffset;
        const appendHeight = this.getAppendHeight(node, range);
        const top = this.getTopOffset(container, range);
        const isOver = () => {
            return this.getHeight(range) + top + appendHeight > height + this.HEIGHT_GAP;
        }
        const end = this.halfSplit(range, 0, length, isOver);
        const leftText = text.slice(0, end);
        const moveText = text.slice(end);
        return { left: this.createTextNode(leftText), move: this.createTextNode(moveText) };
    }
    /** 创建文本节点 */
    private createTextNode(text: string): Text | null {
        if (text.length) {
            const node = document.createTextNode(text);
            return node;
        }
        return null;
    }
    /** 二分查找临界位置 */
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