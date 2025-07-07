/**
 * 文本拆分
 * 1. 递归遍历dom树
 *   1.1 若为纯文本节点，二分分割
 *   1.2 若为元素节点，递归处理子节点
 */
export default class TextSplit {
    splitText(source: HTMLDivElement, target: HTMLDivElement, html: string) {
        if (!source || !target) return;
        source.innerHTML = html;
        const height = this.getContainerHeight(source);
        this.splitNode(source, height, 0);
    }
    // 允许误差
    HEIGHT_GAP = 0.001;

    /** 辅助函数-字符串转数值
     * @param numval 数字字符串
     */
    private getNum(numval: string) {
        const num = parseFloat(numval);
        return isNaN(num) ? 0 : num;
    }
    /** 辅助函数-创建range
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

    /**
     * 获取容器内容部分高度
     * @param node 当前节点
     */
    private getContainerHeight(node: Element) {
        // dom可用高度
        const height = node.getBoundingClientRect().height;
        // 去除padding和border的高度
        const { paddingTop, paddingBottom, borderTopWidth, borderBottomWidth } = getComputedStyle(node);
        const gapHeight = this.getNum(paddingTop) + this.getNum(paddingBottom) + this.getNum(borderTopWidth) + this.getNum(borderBottomWidth);
        return height - gapHeight;
    }

    /**
     * 嵌套分割节点
     * @param node 当前节点
     * @param height 总高度
     * @param top 距离顶部距离
     */
    private splitNode(node: Element, height: number, top: number) {
        if (this.isTextNode(node)) {
            // 纯文本节点
            return this.splitTextNode(node, height, top);
        }
        const nodeHeight = node.scrollHeight;
        if (nodeHeight + top <= height + this.HEIGHT_GAP) {
            // 没有溢出
            return;
        }
        const children = Array.from(node.childNodes);
        if (children.length <= 0) {
            // 没有子元素，整个溢出
        }
        for (let idx = 0; idx < children.length; idx++) {
            // 处理每个子节点
            this.splitNode(children[idx] as Element, height, top);
        }
    }
    /** 获取range和lineHeight的差值高度 */
    getAppendHeight(node: Element, range: Range) {
        const { display, lineHeight, fontSize } = getComputedStyle(node.parentNode as Element);
        console.log(display, lineHeight, fontSize, range.getBoundingClientRect().height);
    }
    /**
     * 分割文本节点
     * @param node 当前节点
     * @param height 总高度
     * @param top 距离顶部距离
     */
    private splitTextNode(node: Element, height: number, top: number) {
        // 文本内容
        const text = node.textContent || '';
        const range = this.createRange(node);
        const appendHeight = this.getAppendHeight(node, range);
    }
}